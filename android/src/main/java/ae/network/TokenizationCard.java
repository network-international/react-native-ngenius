package ae.network;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.method.PasswordTransformationMethod;
import android.view.View;
import android.view.Gravity;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.WritableMap;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// This native-only form owns card fields and the /cards HTTP body for its entire lifetime.
final class TokenizationCard {
    final String requestId;
    private final Dialog dialog;
    private final Callback ready;
    private Callback result;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private EditText pan, expiry, cvv, name;
    private Button submit;
    private TextView error;
    private LinearLayout processing;
    private volatile boolean finished;
    private boolean prepared;
    private boolean sent;
    private JSONObject card;
    private volatile HttpURLConnection connection;

    TokenizationCard(Activity activity, JSONObject config, Callback ready, Callback result) {
        this.requestId = config.optString("requestId");
        this.ready = ready;
        this.result = result;
        dialog = new Dialog(activity);
        JSONObject labels = config.optJSONObject("labels");
        if (labels == null) labels = new JSONObject();
        final String invalid = labels.optString("invalid", "Check card details");
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        ScrollView scroll = new ScrollView(activity);
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(24 * activity.getResources().getDisplayMetrics().density);
        form.setPadding(padding, padding, padding, padding);
        form.setLayoutDirection(config.optBoolean("rtl") ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
        JSONObject colors = config.optJSONObject("colors");
        form.setBackgroundColor(color(colors, "payPageBackgroundColor", Color.WHITE));
        int textColor = color(colors, "payPageLabelColor", Color.BLACK);
        float density = activity.getResources().getDisplayMetrics().density;
        LinearLayout header = new LinearLayout(activity);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        ImageButton back = new ImageButton(activity);
        back.setImageDrawable(new BackChevron(textColor, density, config.optBoolean("rtl")));
        back.setBackgroundResource(android.R.drawable.list_selector_background);
        back.setContentDescription(labels.optString("back", "Back"));
        back.setId(android.R.id.home);
        back.setTag("tokenization-card-back");
        back.setOnClickListener(view -> cancel());
        int navigationSize = Math.round(48 * density);
        header.addView(back, new LinearLayout.LayoutParams(navigationSize, navigationSize));
        TextView title = new TextView(activity);
        title.setText(labels.optString("title", "Add Card"));
        title.setTextSize(20);
        title.setTextColor(color(colors, "payPageTitleColor", textColor));
        if (android.os.Build.VERSION.SDK_INT >= 28) title.setAccessibilityHeading(true);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        form.addView(header);
        pan = field(activity, form, labels.optString("pan", "Card number"), true, true, textColor);
        expiry = field(activity, form, labels.optString("expiry", "Expiry (MM/YY)"), false, false, textColor);
        cvv = field(activity, form, labels.optString("cvv", "Security code"), true, true, textColor);
        name = field(activity, form, labels.optString("name", "Cardholder name"), false, false, textColor);
        error = new TextView(activity); error.setTextColor(Color.RED); form.addView(error);
        submit = new Button(activity); submit.setText(labels.optString("submit", "Add Card"));
        submit.setTextColor(color(colors, "payButtonTitleColor", Color.BLACK));
        submit.setBackgroundColor(color(colors, "payButtonBackgroundColor", 0xffffdc84));
        form.addView(submit);
        processing = new LinearLayout(activity);
        processing.setOrientation(LinearLayout.HORIZONTAL);
        processing.setGravity(Gravity.CENTER_VERTICAL);
        processing.setTag("tokenization-card-processing");
        processing.setVisibility(View.GONE);
        ProgressBar spinner = new ProgressBar(activity, null, android.R.attr.progressBarStyleSmall);
        spinner.setIndeterminate(true);
        spinner.setTag("tokenization-card-spinner");
        int spinnerSize = Math.round(24 * density);
        processing.addView(spinner, new LinearLayout.LayoutParams(spinnerSize, spinnerSize));
        TextView processingLabel = new TextView(activity);
        processingLabel.setText(labels.optString("processing", "Saving payment method…"));
        processingLabel.setTextColor(textColor);
        processingLabel.setTag("tokenization-card-processing-label");
        processingLabel.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        LinearLayout.LayoutParams processingTextLayout = new LinearLayout.LayoutParams(0, -2, 1);
        processingTextLayout.setMarginStart(Math.round(12 * density));
        processing.addView(processingLabel, processingTextLayout);
        form.addView(processing);
        submit.setOnClickListener(view -> {
            if (prepared || finished) return;
            String number = TokenizationCardValidation.digits(pan.getText().toString());
            String date = TokenizationCardValidation.expiry(expiry.getText().toString().trim());
            String securityCode = cvv.getText().toString();
            String holder = name.getText().toString().trim();
            int cvvLength = number.startsWith("34") || number.startsWith("37") ? 4 : 3;
            if (!TokenizationCardValidation.validPan(number) || date == null ||
                !securityCode.matches("[0-9]{" + cvvLength + "}") || holder.isEmpty() || holder.length() > 100) {
                error.setText(invalid); return;
            }
            try {
                card = new JSONObject().put("pan", number).put("expiry", date)
                    .put("cvv", securityCode).put("cardholderName", holder);
                prepared = true;
                pan.setEnabled(false); expiry.setEnabled(false); cvv.setEnabled(false); name.setEnabled(false);
                submit.setEnabled(false); error.setText("");
                processing.setVisibility(View.VISIBLE);
                InputMethodManager keyboard = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
                if (keyboard != null) keyboard.hideSoftInputFromWindow(submit.getWindowToken(), 0);
                ready.invoke(requestId);
            } catch (Exception ignored) { finish("Failed", null); }
        });
        scroll.addView(form); dialog.setContentView(scroll);
        dialog.setOnCancelListener(ignored -> finish("Aborted", null));
    }
    void show() {
        if (requestId.isEmpty()) { finish("Failed", null); return; }
        dialog.show();
        if (dialog.getWindow() != null) {
            dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            dialog.getWindow().setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT);
        }
    }
    private static EditText field(Activity activity, LinearLayout form, String label, boolean numeric, boolean secret, int color) {
        TextView title = new TextView(activity); title.setText(label); title.setTextColor(color); form.addView(title);
        EditText field = new EditText(activity); field.setTextColor(color); field.setContentDescription(label);
        field.setSingleLine(true); field.setSaveEnabled(false);
        field.setInputType(numeric ? InputType.TYPE_CLASS_NUMBER : InputType.TYPE_CLASS_TEXT);
        if (secret) field.setTransformationMethod(PasswordTransformationMethod.getInstance());
        if (android.os.Build.VERSION.SDK_INT >= 26) field.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        form.addView(field, new LinearLayout.LayoutParams(-1, -2));
        return field;
    }
    private static int color(JSONObject colors, String key, int fallback) {
        try { return colors == null ? fallback : Color.parseColor(colors.optString(key)); }
        catch (Exception ignored) { return fallback; }
    }
    private static final class BackChevron extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final boolean rtl;
        private final int size;

        BackChevron(int color, float density, boolean rtl) {
            this.rtl = rtl;
            size = Math.round(24 * density);
            paint.setColor(color);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(2 * density);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
        }
        @Override public void draw(Canvas canvas) {
            float width = getBounds().width(), height = getBounds().height();
            float outside = rtl ? 0.35f : 0.65f;
            float inside = rtl ? 0.65f : 0.35f;
            Path path = new Path();
            path.moveTo(getBounds().left + width * outside, getBounds().top + height * 0.25f);
            path.lineTo(getBounds().left + width * inside, getBounds().top + height * 0.5f);
            path.lineTo(getBounds().left + width * outside, getBounds().top + height * 0.75f);
            canvas.drawPath(path, paint);
        }
        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); invalidateSelf(); }
        @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); invalidateSelf(); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
        @Override public int getIntrinsicWidth() { return size; }
        @Override public int getIntrinsicHeight() { return size; }
    }
    void submit(JSONObject options) {
        if (finished || sent || !prepared || card == null) return;
        String endpoint = options.optString("url");
        String accessToken = options.optString("accessToken");
        Object sessionRef = options.opt("sessionRef");
        String usageType = options.optString("usageType");
        JSONObject consent = options.optJSONObject("consentData");
        if (!(sessionRef instanceof String) || !TokenizationCardValidation.validEndpoint(endpoint, (String) sessionRef) ||
            !TokenizationCardValidation.validUsageType(usageType) || accessToken.isEmpty() ||
            accessToken.contains("\r") || accessToken.contains("\n") || consent == null) {
            finish("Failed", null);
            return;
        }
        sent = true;
        final byte[] payload;
        try {
            payload = new JSONObject()
                .put("card", card)
                .put("usageType", usageType)
                .put("consentData", consent)
                .toString().getBytes(StandardCharsets.UTF_8);
        } catch (Exception ignored) { finish("Failed", null); return; }
        card = null; pan.setText(""); cvv.setText(""); expiry.setText(""); name.setText("");
        worker.execute(() -> {
            Map<String, Object> safeResponse = null;
            try {
                if (finished) return;
                HttpURLConnection request = (HttpURLConnection) new URL(endpoint).openConnection(); connection = request;
                request.setInstanceFollowRedirects(false); request.setUseCaches(false);
                request.setConnectTimeout(30000); request.setReadTimeout(30000);
                request.setRequestMethod("POST"); request.setDoOutput(true);
                request.setRequestProperty("Content-Type", "application/json");
                request.setRequestProperty("Access-Token", accessToken); request.setRequestProperty("Cookie", "");
                request.setFixedLengthStreamingMode(payload.length);
                try (java.io.OutputStream body = request.getOutputStream()) { body.write(payload); }
                int status = request.getResponseCode();
                if (status >= 200 && status < 300 && !finished) {
                    try (InputStream input = request.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                        byte[] buffer = new byte[4096]; int count;
                        while ((count = input.read(buffer)) != -1) {
                            if (output.size() + count > 65536) throw new java.io.IOException();
                            output.write(buffer, 0, count);
                        }
                        safeResponse = safeResponse(new JSONObject(output.toString("UTF-8")));
                    }
                }
            } catch (Exception ignored) { /* Never forward a response body or exception containing card data. */ }
            finally { Arrays.fill(payload, (byte) 0); if (connection != null) { connection.disconnect(); connection = null; } }
            final Map<String, Object> response = safeResponse;
            main.post(() -> finish(response == null ? "Failed" : "Response", response));
        });
    }
    private static Map<String, Object> safeResponse(JSONObject source) throws Exception {
        JSONArray tokens = source.getJSONArray("tokens");
        List<Map<String, Object>> safeTokens = new ArrayList<>(tokens.length());
        for (int i = 0; i < tokens.length(); i++) {
            safeTokens.add(safeToken(tokens.getJSONObject(i)));
        }
        Map<String, Object> safe = new HashMap<>();
        safe.put("tokens", safeTokens);
        if (source.opt("tncUrl") instanceof String) safe.put("tncUrl", source.getString("tncUrl"));
        JSONObject page = source.optJSONObject("page");
        if (page != null) {
            Map<String, Object> safePage = new HashMap<>();
            for (String field : new String[]{"number", "size", "totalElements", "totalPages"}) {
                if (page.opt(field) instanceof Number) safePage.put(field, page.get(field));
            }
            safe.put("page", safePage);
        }
        return safe;
    }
    private static Map<String, Object> safeToken(JSONObject source) throws Exception {
        Map<String, Object> safe = new HashMap<>();
        for (String field : new String[]{"tokenRef", "type", "status", "walletType"}) {
            if (source.opt(field) instanceof String) safe.put(field, source.getString(field));
        }
        JSONObject details = source.optJSONObject("cardDetails");
        if (details != null) {
            Map<String, Object> masked = new HashMap<>();
            if (details.opt("scheme") instanceof String) masked.put("scheme", details.getString("scheme"));
            String last4 = details.optString("last4");
            String expiry = details.optString("expiry");
            if (details.opt("last4") instanceof String && last4.matches("[0-9]{4}")) masked.put("last4", last4);
            if (details.opt("expiry") instanceof String && expiry.matches("[0-9]{4}-(0[1-9]|1[0-2])")) {
                masked.put("expiry", expiry);
            }
            safe.put("cardDetails", masked);
        }
        return safe;
    }
    void cancel() { finish("Aborted", null); }
    void fail() { finish("Failed", null); }
    private void finish(String status, Map<String, Object> response) {
        if (finished) return;
        finished = true; card = null;
        if (connection != null) connection.disconnect();
        worker.shutdownNow();
        pan.setText(""); cvv.setText(""); expiry.setText(""); name.setText("");
        processing.setVisibility(View.GONE);
        dialog.setOnCancelListener(null); dialog.dismiss();
        Callback callback = result; result = null;
        if (callback != null) {
            WritableMap safe = response == null ? Arguments.createMap() : Arguments.makeNativeMap(response);
            callback.invoke(status, safe);
        }
    }
}
