package ae.network;

import android.app.Activity;
import android.app.Dialog;
import android.animation.ValueAnimator;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextWatcher;
import android.text.method.DigitsKeyListener;
import android.text.method.LinkMovementMethod;
import android.text.method.PasswordTransformationMethod;
import android.text.style.ClickableSpan;
import android.view.View;
import android.view.Gravity;
import android.view.Window;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.WritableMap;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// This native-only form owns card fields and the /cards HTTP body for its entire lifetime.
final class TokenizationCard {
    final String requestId;
    private final Dialog dialog;
    private final boolean bottomSheet;
    private final ScrollView scroll;
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
        bottomSheet = "bottomSheet".equals(config.optString("mode"));
        JSONObject labels = config.optJSONObject("labels");
        if (labels == null) labels = new JSONObject();
        final String invalid = labels.optString("invalid", "Check card details");
        final String processingLabel = labels.optString("processing", "Verifying payment method…");
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(24 * activity.getResources().getDisplayMetrics().density);
        form.setPadding(padding, bottomSheet ? 0 : padding, padding, Math.round(16 * activity.getResources().getDisplayMetrics().density));
        form.setLayoutDirection(config.optBoolean("rtl") ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
        JSONObject colors = config.optJSONObject("colors");
        int surface = color(colors, "payPageBackgroundColor", Color.WHITE);
        int border = color(colors, "textFieldBorderColor", 0xffdce1e6);
        int focus = color(colors, "textFieldFocusColor", 0xff0069b1);
        if (bottomSheet) {
            GradientDrawable panel = new GradientDrawable();
            panel.setColor(surface);
            float radius = 28 * activity.getResources().getDisplayMetrics().density;
            panel.setCornerRadii(new float[] {radius, radius, radius, radius, 0, 0, 0, 0});
            scroll.setBackground(panel);
            scroll.setClipToOutline(true);
        } else {
            scroll.setBackgroundColor(surface);
        }
        int textColor = color(colors, "payPageLabelColor", Color.BLACK);
        int hintColor = color(colors, "textFieldPlaceholderColor", 0xff757575);
        float density = activity.getResources().getDisplayMetrics().density;
        if (bottomSheet) {
            View handle = new View(activity);
            GradientDrawable handleShape = new GradientDrawable();
            handleShape.setColor(border);
            handleShape.setCornerRadius(2 * density);
            handle.setBackground(handleShape);
            LinearLayout.LayoutParams handleLayout = new LinearLayout.LayoutParams(Math.round(36 * density), Math.round(4 * density));
            handleLayout.gravity = Gravity.CENTER_HORIZONTAL;
            handleLayout.topMargin = Math.round(10 * density);
            form.addView(handle, handleLayout);
        }
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
        title.setText(labels.optString("title", "Pay by card"));
        title.setTextSize(20);
        title.setTextColor(color(colors, "payPageTitleColor", textColor));
        if (android.os.Build.VERSION.SDK_INT >= 28) title.setAccessibilityHeading(true);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        form.addView(header);
        List<String> acceptedSchemes = cardSchemeNames(config.optJSONArray("acceptedSchemes"));
        addAcceptedSchemes(activity, form, labels, acceptedSchemes, textColor, density);

        TextView cardInformation = fieldLabel(activity, labels.optString("cardInformation", "Card information"), textColor);
        if (android.os.Build.VERSION.SDK_INT >= 28) cardInformation.setAccessibilityHeading(true);
        LinearLayout.LayoutParams informationLayout = new LinearLayout.LayoutParams(-1, -2);
        informationLayout.topMargin = Math.round(8 * density);
        informationLayout.bottomMargin = Math.round(6 * density);
        form.addView(cardInformation, informationLayout);

        LinearLayout cardGroup = new LinearLayout(activity);
        cardGroup.setOrientation(LinearLayout.VERTICAL);
        cardGroup.setTag("tokenization-card-information");
        cardGroup.setPadding(1, 1, 1, 1);
        GradientDrawable groupOutline = fieldOutline(border, density);
        cardGroup.setBackground(groupOutline);
        form.addView(cardGroup, new LinearLayout.LayoutParams(-1, -2));

        String panLabel = labels.optString("pan", "Card number");
        pan = groupedField(activity, cardGroup, panLabel, labels.optString("panPlaceholder", "•••• •••• •••• 1234"),
            textColor, hintColor, groupOutline, border, focus);
        configureNumericField(pan, " ", new PrivateDigitsTransformation(Boolean.TRUE.equals(config.opt("maskPaymentInfo"))));
        Drawable cardIcon = new CardIcon(hintColor, density, false);
        pan.setCompoundDrawablePadding(Math.round(8 * density));
        pan.setCompoundDrawablesWithIntrinsicBounds(null, null, cardIcon, null);

        LinearLayout details = new LinearLayout(activity);
        boolean stackDetails = activity.getResources().getConfiguration().fontScale >= 1.3f;
        details.setOrientation(stackDetails ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        int line = Math.max(1, Math.round(density));
        addDivider(activity, cardGroup, border, -1, line);
        cardGroup.addView(details, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout expiryGroup = detailCell(activity, details, stackDetails);
        addDivider(activity, details, border, stackDetails ? -1 : line, stackDetails ? line : -1);
        LinearLayout cvvGroup = detailCell(activity, details, stackDetails);
        expiry = groupedField(activity, expiryGroup, labels.optString("expiry", "Expiration date"),
            labels.optString("expiryPlaceholder", "MM/YY"), textColor, hintColor, groupOutline, border, focus);
        configureNumericField(expiry, "/-", null);
        watchDigits(expiry, DigitFormat.EXPIRY, digits -> { });
        String cvvHint = labels.optString("cvvPlaceholder", "123");
        cvv = groupedField(activity, cvvGroup, labels.optString("cvv", "Security code"), cvvHint,
            textColor, hintColor, groupOutline, border, focus);
        configureNumericField(cvv, "", new PrivateDigitsTransformation(true));
        cvv.setCompoundDrawablePadding(Math.round(6 * density));
        cvv.setCompoundDrawablesWithIntrinsicBounds(null, null, new CardIcon(hintColor, density, true), null);
        pan.setFilters(new InputFilter[]{new InputFilter.LengthFilter(23)});
        cvv.setFilters(new InputFilter[]{new InputFilter.LengthFilter(4)});
        String[] displayedScheme = {null};
        watchDigits(pan, DigitFormat.PAN, number -> {
            String scheme = number.length() < 2 ? null : TokenizationCardValidation.scheme(number);
            if (Objects.equals(displayedScheme[0], scheme)) return;
            displayedScheme[0] = scheme;
            Bitmap logo = acceptedSchemes.contains(scheme) ? loadSchemeLogo(activity, scheme) : null;
            Drawable icon = logo == null ? cardIcon : new CardLogo(logo, density);
            pan.setCompoundDrawablesWithIntrinsicBounds(null, null, icon, null);
            pan.setContentDescription(scheme == null ? panLabel : panLabel + ", " + scheme);
            int limit = scheme == null ? 4 : TokenizationCardValidation.cvvLength(number);
            cvv.setFilters(new InputFilter[]{new InputFilter.LengthFilter(limit)});
            cvv.setHint(scheme != null && limit == 4 ? "1234" : cvvHint);
        });
        TextView nameLabel = fieldLabel(activity, labels.optString("name", "Name on card"), textColor);
        LinearLayout.LayoutParams nameLabelLayout = new LinearLayout.LayoutParams(-1, -2);
        nameLabelLayout.topMargin = Math.round(14 * density);
        nameLabelLayout.bottomMargin = Math.round(6 * density);
        form.addView(nameLabel, nameLabelLayout);
        name = editText(activity, nameLabel.getText().toString(), labels.optString("namePlaceholder", "Enter name on card"),
            textColor, hintColor);
        GradientDrawable nameOutline = fieldOutline(border, density);
        name.setBackground(nameOutline);
        highlightOnFocus(name, nameOutline, border, focus, density);
        int nameInset = Math.round(12 * density);
        name.setPaddingRelative(nameInset, 0, nameInset, 0);
        name.setMinHeight(Math.round(50 * density));
        name.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        form.addView(name, new LinearLayout.LayoutParams(-1, -2));
        error = new TextView(activity); error.setTextColor(0xffb52222); error.setVisibility(View.GONE);
        error.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        form.addView(error);
        submit = new Button(activity); submit.setText(labels.optString("submit", "Pay"));
        submit.setAllCaps(false);
        int submitTextColor = color(colors, "payButtonTitleColor", Color.BLACK);
        submit.setTextColor(submitTextColor);
        GradientDrawable buttonShape = new GradientDrawable();
        buttonShape.setColor(color(colors, "payButtonBackgroundColor", 0xffffdc84));
        buttonShape.setCornerRadius(25 * density);
        submit.setBackground(new RippleDrawable(ColorStateList.valueOf(0x20000000), buttonShape, null));
        FrameLayout submitArea = new FrameLayout(activity);
        submit.setMinHeight(Math.round(50 * density));
        submitArea.addView(submit, new FrameLayout.LayoutParams(-1, -2));
        ProgressBar spinner = new ProgressBar(activity, null, android.R.attr.progressBarStyleSmall);
        spinner.setIndeterminate(true);
        spinner.setIndeterminateTintList(ColorStateList.valueOf(submitTextColor));
        spinner.setTag("tokenization-card-spinner");
        spinner.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        spinner.setVisibility(View.GONE);
        int spinnerSize = Math.round(24 * density);
        submitArea.addView(spinner, new FrameLayout.LayoutParams(spinnerSize, spinnerSize, Gravity.CENTER));
        LinearLayout.LayoutParams submitLayout = new LinearLayout.LayoutParams(-1, -2);
        submitLayout.topMargin = Math.round(18 * density);
        form.addView(submitArea, submitLayout);
        addConsentNotice(activity, form, config.optJSONObject("consent"), textColor, density);
        addSecurityNote(activity, form, config.optString("securityNote"), textColor, density);
        submit.setOnClickListener(view -> {
            if (prepared || finished) return;
            String number = TokenizationCardValidation.digits(pan.getText().toString());
            String date = TokenizationCardValidation.expiry(expiry.getText().toString().trim());
            String securityCode = cvv.getText().toString();
            String holder = name.getText().toString().trim();
            if (!TokenizationCardValidation.validPan(number) || date == null ||
                !TokenizationCardValidation.validCvv(number, securityCode) || holder.isEmpty() || holder.length() > 100) {
                error.setText(invalid); error.setVisibility(View.VISIBLE); return;
            }
            try {
                card = new JSONObject().put("pan", number).put("expiry", date)
                    .put("cvv", securityCode).put("cardholderName", holder);
                prepared = true;
                pan.setEnabled(false); expiry.setEnabled(false); cvv.setEnabled(false); name.setEnabled(false);
                back.setEnabled(false);
                dialog.setCancelable(false);
                submit.setEnabled(false);
                submit.setText("");
                submit.setContentDescription(processingLabel);
                submit.announceForAccessibility(processingLabel);
                error.setVisibility(View.GONE);
                spinner.setVisibility(View.VISIBLE);
                InputMethodManager keyboard = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
                if (keyboard != null) keyboard.hideSoftInputFromWindow(submit.getWindowToken(), 0);
                ready.invoke(requestId);
            } catch (Exception ignored) { finish("Failed", null); }
        });
        scroll.addView(form);
        if (bottomSheet) {
            double heightDp = config.optDouble("sheetHeight", 0);
            double heightFraction = config.optDouble("sheetHeightFraction", .64);
            double maxWidthDp = config.optDouble("sheetMaxWidth", 560);
            FrameLayout host = new CardSheetHost(activity, scroll, Math.max(0, (int) Math.round(heightDp * density)),
                heightFraction > 0 && heightFraction <= 1 ? heightFraction : .64,
                (int) Math.round((maxWidthDp > 0 ? maxWidthDp : 560) * density));
            View backdrop = new View(activity);
            backdrop.setOnClickListener(view -> { if (!prepared) cancel(); });
            host.addView(backdrop, new FrameLayout.LayoutParams(-1, -1));
            host.addView(scroll, new FrameLayout.LayoutParams(-1, 0, Gravity.TOP | Gravity.CENTER_HORIZONTAL));
            dialog.setContentView(host);
        } else {
            dialog.setContentView(scroll);
        }
        dialog.setOnCancelListener(ignored -> finish("Aborted", null));
    }
    private static TextView footnote(Activity activity, String text, int color) {
        TextView note = new TextView(activity);
        note.setText(text);
        note.setTextColor(color);
        note.setTextSize(12);
        return note;
    }
    private static List<String> cardSchemeNames(JSONArray schemes) {
        if (schemes == null) return Collections.emptyList();
        List<String> names = new ArrayList<>();
        for (int i = 0; i < schemes.length(); i++) {
            Object name = schemes.opt(i);
            if (name instanceof String && !((String) name).isEmpty()) names.add((String) name);
        }
        return names;
    }
    private static void addAcceptedSchemes(Activity activity, LinearLayout form, JSONObject labels,
                                           List<String> names, int color, float density) {
        if (names.isEmpty()) return;
        String title = labels.optString("acceptedSchemes", "Accepted cards");
        ArrayList<Bitmap> logos = new ArrayList<>();
        for (String name : names) {
            Bitmap logo = loadSchemeLogo(activity, name);
            if (logo == null) break;
            logos.add(logo);
        }
        if (logos.size() != names.size()) {
            TextView note = footnote(activity, title + ": " + android.text.TextUtils.join(" · ", names), color);
            note.setTag("tokenization-card-accepted-schemes");
            form.addView(note);
            return;
        }

        LinearLayout group = new LinearLayout(activity);
        group.setOrientation(LinearLayout.VERTICAL);
        group.setTag("tokenization-card-accepted-schemes");
        group.setPadding(0, 0, 0, Math.round(6 * density));
        group.addView(footnote(activity, title, color));
        LinearLayout row = null;
        int availableWidthDp = activity.getResources().getConfiguration().screenWidthDp - 48;
        int logosPerRow = Math.max(1, availableWidthDp / 50);
        for (int i = 0; i < logos.size(); i++) {
            if (i % logosPerRow == 0) {
                row = new LinearLayout(activity);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setPadding(0, Math.round(6 * density), 0, 0);
                group.addView(row);
            }
            ImageView logo = new ImageView(activity);
            logo.setImageBitmap(logos.get(i));
            logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
            logo.setContentDescription(names.get(i));
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(Math.round(42 * density), Math.round(24 * density));
            layout.setMarginEnd(Math.round(8 * density));
            row.addView(logo, layout);
        }
        form.addView(group);
    }
    private static Bitmap loadSchemeLogo(Activity activity, String name) {
        String key = name.toLowerCase(Locale.ROOT).replace(" ", "");
        if (!key.matches("[a-z]+")) return null;
        try (InputStream asset = activity.getAssets().open("ni_card_scheme_" + key + ".png")) {
            return BitmapFactory.decodeStream(asset);
        } catch (IOException ignored) {
            return null;
        }
    }
    private static void addSecurityNote(Activity activity, LinearLayout form, String text, int color, float density) {
        if (text.isEmpty()) return;
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, Math.round(8 * density), 0, 0);
        ImageView lock = new ImageView(activity);
        lock.setImageResource(android.R.drawable.ic_lock_lock);
        lock.setColorFilter(color);
        lock.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        int iconSize = Math.round(16 * density);
        LinearLayout.LayoutParams iconLayout = new LinearLayout.LayoutParams(iconSize, iconSize);
        iconLayout.setMarginEnd(Math.round(8 * density));
        row.addView(lock, iconLayout);
        row.addView(footnote(activity, text, color), new LinearLayout.LayoutParams(0, -2, 1));
        form.addView(row);
    }
    void show() {
        if (requestId.isEmpty()) { finish("Failed", null); return; }
        Window window = dialog.getWindow();
        if (window != null) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
            if (bottomSheet) {
                window.setBackgroundDrawableResource(android.R.color.transparent);
                window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
                window.setWindowAnimations(0);
                if (android.os.Build.VERSION.SDK_INT < 26 || ValueAnimator.areAnimatorsEnabled()) {
                    scroll.setAlpha(0f);
                    scroll.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
                        @Override public void onLayoutChange(View view, int left, int top, int right, int bottom,
                                                            int oldLeft, int oldTop, int oldRight, int oldBottom) {
                            if (finished || bottom <= top) return;
                            scroll.removeOnLayoutChangeListener(this);
                            scroll.animate().alpha(1f).setDuration(180)
                                .setInterpolator(new DecelerateInterpolator()).start();
                        }
                    });
                }
            }
        }
        dialog.show();
        if (window != null) {
            window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT);
        }
    }
    private static void addConsentNotice(Activity activity, LinearLayout form, JSONObject consent, int color, float density) {
        if (consent == null) return;
        String text = consent.optString("text");
        if (text.isEmpty()) return;
        TextView notice = new TextView(activity);
        notice.setTextColor(color);
        notice.setTag("tokenization-card-consent");
        notice.setPadding(0, Math.round(8 * density), 0, Math.round(4 * density));

        String urlText = consent.optString("url");
        Uri url = Uri.parse(urlText);
        String linkLabel = consent.optString("linkLabel");
        int linkStart = linkLabel.isEmpty() ? -1 : text.indexOf(linkLabel);
        boolean validUrl = ("https".equalsIgnoreCase(url.getScheme()) || "http".equalsIgnoreCase(url.getScheme())) &&
            url.getHost() != null && !url.getHost().isEmpty() && url.getUserInfo() == null &&
            urlText.indexOf('\\') < 0 && !urlText.matches("(?s).*\\s.*");
        if (linkStart >= 0 && validUrl) {
            SpannableString content = new SpannableString(text);
            content.setSpan(new ClickableSpan() {
                @Override public void onClick(View view) {
                    try {
                        activity.startActivity(new Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE));
                    } catch (ActivityNotFoundException | SecurityException ignored) {
                        // A device can lack a browser or the host can restrict external links.
                    }
                }
            }, linkStart, linkStart + linkLabel.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            notice.setText(content);
            notice.setMovementMethod(LinkMovementMethod.getInstance());
        } else {
            notice.setText(text);
        }
        form.addView(notice, new LinearLayout.LayoutParams(-1, -2));
    }
    private static LinearLayout detailCell(Activity activity, LinearLayout details, boolean stacked) {
        LinearLayout cell = new LinearLayout(activity);
        cell.setOrientation(LinearLayout.VERTICAL);
        details.addView(cell, stacked ? new LinearLayout.LayoutParams(-1, -2)
            : new LinearLayout.LayoutParams(0, -2, 1));
        return cell;
    }

    private static void addDivider(Activity activity, LinearLayout parent, int color, int width, int height) {
        View divider = new View(activity);
        divider.setBackgroundColor(color);
        divider.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        parent.addView(divider, new LinearLayout.LayoutParams(width, height));
    }

    private static TextView fieldLabel(Activity activity, String text, int color) {
        TextView label = new TextView(activity);
        label.setText(text);
        label.setTextColor(color);
        label.setTextSize(14);
        label.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return label;
    }

    private static EditText groupedField(Activity activity, LinearLayout parent, String label, String placeholder,
                                         int color, int hintColor, GradientDrawable outline, int border, int focus) {
        float density = activity.getResources().getDisplayMetrics().density;
        int inset = Math.round(12 * density);
        LinearLayout cell = new LinearLayout(activity);
        cell.setOrientation(LinearLayout.VERTICAL);
        cell.setPadding(0, Math.round(6 * density), 0, Math.round(3 * density));
        parent.addView(cell, new LinearLayout.LayoutParams(-1, -2));
        TextView title = fieldLabel(activity, label, color);
        title.setTextSize(12);
        title.setIncludeFontPadding(false);
        title.setPaddingRelative(inset, 0, inset, 0);
        title.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        cell.addView(title, new LinearLayout.LayoutParams(-1, -2));
        EditText field = editText(activity, label, placeholder, color, hintColor);
        field.setBackgroundColor(Color.TRANSPARENT);
        field.setPaddingRelative(inset, 0, inset, 0);
        field.setMinHeight(Math.round(30 * density));
        highlightOnFocus(field, outline, border, focus, density);
        cell.addView(field, new LinearLayout.LayoutParams(-1, -2));
        cell.setOnClickListener(view -> {
            if (!field.isEnabled() || !field.requestFocus()) return;
            InputMethodManager keyboard = (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (keyboard != null) keyboard.showSoftInput(field, InputMethodManager.SHOW_IMPLICIT);
        });
        cell.setFocusable(false);
        cell.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return field;
    }

    private static EditText editText(Activity activity, String label, String placeholder, int color, int hintColor) {
        EditText field = new EditText(activity);
        field.setTextColor(color);
        field.setContentDescription(label);
        field.setHint(placeholder);
        field.setHintTextColor(hintColor);
        field.setIncludeFontPadding(false);
        field.setTextSize(16);
        field.setSingleLine(true);
        field.setSaveEnabled(false);
        if (android.os.Build.VERSION.SDK_INT >= 26) field.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        return field;
    }

    private static GradientDrawable fieldOutline(int border, float density) {
        GradientDrawable outline = new GradientDrawable();
        outline.setColor(Color.TRANSPARENT);
        outline.setCornerRadius(10 * density);
        outline.setStroke(Math.max(1, Math.round(density)), border);
        return outline;
    }

    private static void highlightOnFocus(EditText field, GradientDrawable outline, int border, int focus, float density) {
        int stroke = Math.max(1, Math.round(density));
        field.setOnFocusChangeListener((view, focused) -> outline.setStroke(stroke, focused ? focus : border));
    }

    private static void configureNumericField(EditText field, String allowedSeparators, PrivateDigitsTransformation transformation) {
        field.setKeyListener(DigitsKeyListener.getInstance("0123456789" + allowedSeparators));
        field.setRawInputType(InputType.TYPE_CLASS_NUMBER | (transformation != null ? InputType.TYPE_NUMBER_VARIATION_PASSWORD : 0));
        field.setTextDirection(View.TEXT_DIRECTION_LTR);
        field.setGravity(Gravity.LEFT | Gravity.CENTER_VERTICAL);
        if (transformation != null) {
            field.setTransformationMethod(transformation);
            field.setImeOptions(field.getImeOptions() | EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
        }
    }

    private enum DigitFormat {
        PAN(' ', 4, 19), EXPIRY('/', 2, 4);

        final char separator;
        final int groupSize;
        final int maxDigits;

        DigitFormat(char separator, int groupSize, int maxDigits) {
            this.separator = separator;
            this.groupSize = groupSize;
            this.maxDigits = maxDigits;
        }
    }

    private interface DigitsChanged { void onChange(String digits); }

    private static void watchDigits(EditText field, DigitFormat format, DigitsChanged listener) {
        field.addTextChangedListener(new TextWatcher() {
            private boolean formatting;
            private boolean deletedSeparator;

            @Override public void beforeTextChanged(CharSequence text, int start, int count, int after) {
                if (!formatting) deletedSeparator = count == 1 && after == 0 && text.charAt(start) == format.separator;
            }

            @Override public void onTextChanged(CharSequence text, int start, int before, int count) { }

            @Override public void afterTextChanged(Editable value) {
                if (formatting) return;
                String input = value.toString();
                int selection = Math.max(0, Math.min(field.getSelectionStart(), input.length()));
                int digitsBeforeCursor = input.substring(0, selection).replaceAll("[^0-9]", "").length();
                String digits = input.replaceAll("[^0-9]", "");
                if (format == DigitFormat.EXPIRY && input.matches("20[0-9]{2}-[0-9]{2}")) {
                    digits = input.substring(5) + input.substring(2, 4);
                    digitsBeforeCursor = digits.length();
                }
                if (deletedSeparator && digitsBeforeCursor > 0) {
                    digits = digits.substring(0, digitsBeforeCursor - 1) + digits.substring(digitsBeforeCursor);
                    digitsBeforeCursor--;
                }
                digits = digits.substring(0, Math.min(digits.length(), format.maxDigits));
                StringBuilder grouped = new StringBuilder();
                int cursor = 0;
                for (int i = 0; i < digits.length(); i++) {
                    if (i > 0 && i % format.groupSize == 0) grouped.append(format.separator);
                    grouped.append(digits.charAt(i));
                    if (i < digitsBeforeCursor) cursor = grouped.length();
                }
                if (!input.contentEquals(grouped)) {
                    formatting = true;
                    value.replace(0, value.length(), grouped);
                    field.setSelection(Math.min(cursor, value.length()));
                    formatting = false;
                }
                listener.onChange(digits);
            }
        });
    }

    // Retain Android's password semantics even when the card number is visible.
    private static final class PrivateDigitsTransformation extends PasswordTransformationMethod {
        private final boolean maskDigits;

        PrivateDigitsTransformation(boolean maskDigits) {
            this.maskDigits = maskDigits;
        }

        @Override public CharSequence getTransformation(CharSequence input, View view) {
            if (!maskDigits) return input;
            return new CharSequence() {
                @Override public int length() { return input.length(); }
                @Override public char charAt(int index) { return input.charAt(index) == ' ' ? ' ' : '•'; }
                @Override public CharSequence subSequence(int start, int end) {
                    StringBuilder masked = new StringBuilder(end - start);
                    for (int index = start; index < end; index++) masked.append(charAt(index));
                    return masked.toString();
                }
                @Override public String toString() { return subSequence(0, length()).toString(); }
            };
        }

        @Override public void onTextChanged(CharSequence text, int start, int before, int count) { }
        @Override public void onFocusChanged(View view, CharSequence text, boolean focused, int direction,
                                            android.graphics.Rect previousFocus) { }
    }

    private static final class CardSheetHost extends FrameLayout {
        private final ScrollView sheet;
        private final int initialHeight;
        private final double fraction;
        private final int maxWidth;
        private int previousWidth;
        private int fullHeight;

        CardSheetHost(Activity activity, ScrollView sheet, int initialHeight, double fraction, int maxWidth) {
            super(activity);
            this.sheet = sheet;
            this.initialHeight = initialHeight;
            this.fraction = fraction;
            this.maxWidth = maxWidth;
        }

        @Override protected void onMeasure(int widthSpec, int heightSpec) {
            int width = MeasureSpec.getSize(widthSpec);
            int height = MeasureSpec.getSize(heightSpec);
            boolean resized = previousWidth != 0 && previousWidth != width;
            if (resized) fullHeight = 0;
            previousWidth = width;
            fullHeight = Math.max(fullHeight, height);
            int desiredHeight = initialHeight > 0 ? initialHeight : (int) Math.round(fullHeight * fraction);
            LayoutParams layout = (LayoutParams) sheet.getLayoutParams();
            // The keyboard reduces the scroll viewport while the top stays aligned with the chooser.
            layout.topMargin = Math.max(0, fullHeight - desiredHeight);
            layout.width = Math.min(maxWidth, width);
            layout.height = Math.max(0, height - layout.topMargin);
            super.onMeasure(widthSpec, heightSpec);
        }
    }

    private static final class CardIcon extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int width;
        private final int height;
        private final boolean securityCode;

        CardIcon(int color, float density, boolean securityCode) {
            this.securityCode = securityCode;
            paint.setColor(color);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(1.5f * density);
            width = Math.round((securityCode ? 27 : 32) * density);
            height = Math.round(24 * density);
        }

        @Override public void draw(Canvas canvas) {
            float inset = getBounds().width() * .17f;
            float left = getBounds().left + inset;
            float right = getBounds().right - inset;
            float top = getBounds().top + getBounds().height() * .17f;
            float bottom = getBounds().bottom - getBounds().height() * .17f;
            float radius = paint.getStrokeWidth() * 2;
            canvas.drawRoundRect(new RectF(left, top, right, bottom), radius, radius, paint);
            float stripe = top + (bottom - top) * .32f;
            canvas.drawLine(left, stripe, right, stripe, paint);
            if (securityCode) {
                float dot = paint.getStrokeWidth() * .55f;
                float position = top + (bottom - top) * .66f;
                for (int index = 1; index <= 3; index++) {
                    canvas.drawCircle(left + (right - left) * index / 4, position, dot, paint);
                }
            }
        }

        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); invalidateSelf(); }
        @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); invalidateSelf(); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
        @Override public int getIntrinsicWidth() { return width; }
        @Override public int getIntrinsicHeight() { return height; }
    }

    private static final class CardLogo extends BitmapDrawable {
        private final int width;
        private final int height;

        CardLogo(Bitmap bitmap, float density) {
            super(android.content.res.Resources.getSystem(), bitmap);
            width = Math.round(32 * density);
            height = Math.round(24 * density);
            setFilterBitmap(true);
        }

        @Override public int getIntrinsicWidth() { return width; }
        @Override public int getIntrinsicHeight() { return height; }

        @Override public void draw(Canvas canvas) {
            Bitmap bitmap = getBitmap();
            float scale = Math.min((float) width / bitmap.getWidth(), (float) height / bitmap.getHeight());
            float halfWidth = bitmap.getWidth() * scale / 2;
            float halfHeight = bitmap.getHeight() * scale / 2;
            float x = getBounds().exactCenterX(), y = getBounds().exactCenterY();
            canvas.drawBitmap(bitmap, null, new RectF(x - halfWidth, y - halfHeight,
                x + halfWidth, y + halfHeight), getPaint());
        }
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
        // Keep the disabled form filled while the request is pending; finish clears it.
        card = null;
        worker.execute(() -> {
            Map<String, Object> safeResponse = null;
            int httpStatus = 0;
            boolean networkError = false;
            boolean timedOut = false;
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
                httpStatus = request.getResponseCode();
                if (httpStatus >= 200 && httpStatus < 300 && !finished) {
                    try (InputStream input = request.getInputStream()) {
                        safeResponse = TokenizationCardResponse.read(input);
                    }
                }
            } catch (SocketTimeoutException ignored) { timedOut = true; }
            catch (IOException ignored) { networkError = httpStatus == 0; }
            catch (RuntimeException ignored) {
                // Gson wraps read timeouts while parsing the response stream.
                timedOut = ignored.getCause() instanceof SocketTimeoutException;
            }
            finally { Arrays.fill(payload, (byte) 0); if (connection != null) { connection.disconnect(); connection = null; } }
            final Map<String, Object> response = timedOut ? null : safeResponse;
            Map<String, Object> failureDetails = new HashMap<>();
            if (httpStatus >= 400 && httpStatus <= 599) failureDetails.put("httpStatus", httpStatus);
            if (timedOut || httpStatus == 408 || httpStatus == 504) failureDetails.put("code", "REQUEST_TIMEOUT");
            else if (networkError) failureDetails.put("code", "NETWORK_ERROR");
            final Map<String, Object> failure = failureDetails;
            main.post(() -> finish(response == null ? "Failed" : "Response", response != null ? response : failure));
        });
    }
    void cancel() { finish("Aborted", null); }
    void fail() { finish("Failed", null); }
    private void finish(String status, Map<String, Object> response) {
        if (finished) return;
        finished = true; card = null;
        if (connection != null) connection.disconnect();
        worker.shutdownNow();
        pan.setText(""); cvv.setText(""); expiry.setText(""); name.setText("");
        dialog.setOnCancelListener(null); dialog.dismiss();
        Callback callback = result; result = null;
        if (callback != null) {
            WritableMap safe = response == null ? Arguments.createMap() : Arguments.makeNativeMap(response);
            callback.invoke(status, safe);
        }
    }
}
