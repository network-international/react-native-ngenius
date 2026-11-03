package ae.network;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.method.PasswordTransformationMethod;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.WritableMap;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
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
        dialog.setTitle(labels.optString("title", "Add Card"));
        ScrollView scroll = new ScrollView(activity);
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(24 * activity.getResources().getDisplayMetrics().density);
        form.setPadding(padding, padding, padding, padding);
        form.setLayoutDirection(config.optBoolean("rtl") ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
        JSONObject colors = config.optJSONObject("colors");
        form.setBackgroundColor(color(colors, "payPageBackgroundColor", Color.WHITE));
        int textColor = color(colors, "payPageLabelColor", Color.BLACK);
        pan = field(activity, form, labels.optString("pan", "Card number"), true, true, textColor);
        expiry = field(activity, form, labels.optString("expiry", "Expiry (MM/YY)"), false, false, textColor);
        cvv = field(activity, form, labels.optString("cvv", "Security code"), true, true, textColor);
        name = field(activity, form, labels.optString("name", "Cardholder name"), false, false, textColor);
        error = new TextView(activity); error.setTextColor(Color.RED); form.addView(error);
        submit = new Button(activity); submit.setText(labels.optString("submit", "Add Card"));
        submit.setTextColor(color(colors, "payButtonTitleColor", Color.BLACK));
        submit.setBackgroundColor(color(colors, "payButtonBackgroundColor", 0xffffdc84));
        form.addView(submit);
        Button cancel = new Button(activity); cancel.setText(labels.optString("cancel", "Cancel"));
        cancel.setOnClickListener(view -> finish("Aborted", null)); form.addView(cancel);
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
    void submit(JSONObject options) {
        if (finished || sent || !prepared || card == null) return;
        String endpoint = options.optString("url");
        String accessToken = options.optString("accessToken");
        JSONObject consent = options.optJSONObject("consentData");
        if (!TokenizationCardValidation.validEndpoint(endpoint) || accessToken.isEmpty() ||
            accessToken.contains("\r") || accessToken.contains("\n") || consent == null) { finish("Failed", null); return; }
        sent = true;
        final byte[] payload;
        try { payload = new JSONObject().put("card", card).put("consentData", consent).toString().getBytes(StandardCharsets.UTF_8); }
        catch (Exception ignored) { finish("Failed", null); return; }
        card = null; pan.setText(""); cvv.setText(""); expiry.setText(""); name.setText("");
        worker.execute(() -> {
            JSONObject safeResponse = null;
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
            final JSONObject response = safeResponse;
            main.post(() -> finish(response == null ? "Failed" : "Response", response));
        });
    }
    private static JSONObject safeResponse(JSONObject source) throws Exception {
        JSONObject safe = new JSONObject();
        for (String field : new String[]{"tokenRef", "type", "status", "walletType"}) {
            if (source.opt(field) instanceof String) safe.put(field, source.getString(field));
        }
        JSONObject details = source.optJSONObject("cardDetails");
        if (details != null) {
            JSONObject masked = new JSONObject();
            for (String field : new String[]{"scheme", "last4", "expiry"}) {
                if (details.opt(field) instanceof String) masked.put(field, details.getString(field));
            }
            safe.put("cardDetails", masked);
        }
        return safe;
    }
    void cancel() { finish("Aborted", null); }
    void fail() { finish("Failed", null); }
    private void finish(String status, JSONObject response) {
        if (finished) return;
        finished = true; card = null;
        if (connection != null) connection.disconnect();
        worker.shutdownNow();
        pan.setText(""); cvv.setText(""); expiry.setText(""); name.setText("");
        dialog.setOnCancelListener(null); dialog.dismiss();
        Callback callback = result; result = null;
        if (callback != null) {
            WritableMap safe = response == null ? Arguments.createMap() : Arguments.makeNativeMap(jsonMap(response));
            callback.invoke(status, safe);
        }
    }
    private static java.util.Map<String, Object> jsonMap(JSONObject object) {
        java.util.Map<String, Object> map = new java.util.HashMap<>();
        java.util.Iterator<String> fields = object.keys();
        while (fields.hasNext()) {
            String field = fields.next(); Object value = object.opt(field);
            map.put(field, value instanceof JSONObject ? jsonMap((JSONObject) value) : value);
        }
        return map;
    }
}
