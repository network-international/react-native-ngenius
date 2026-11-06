package ae.network;

import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.events.RCTEventEmitter;
import com.google.android.gms.wallet.button.ButtonConstants;
import com.google.android.gms.wallet.button.ButtonOptions;
import com.google.android.gms.wallet.button.PayButton;

import java.util.Map;

/** Official Google Pay presentation only; all wallet operations remain in NiSdkModule. */
public class NIWalletButtonManager extends SimpleViewManager<NIWalletButtonManager.WalletButtonView> {
    private static final String NAME = "NIWalletButton";
    private static final String PRESS_EVENT = "topPress";

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    protected WalletButtonView createViewInstance(ThemedReactContext context) {
        WalletButtonView view = new WalletButtonView(context);
        view.setOnClickListener(ignored -> {
            if (!view.isDisabled()) {
                context.getJSModule(RCTEventEmitter.class)
                        .receiveEvent(view.getId(), PRESS_EVENT, Arguments.createMap());
            }
        });
        return view;
    }

    @ReactProp(name = "disabled", defaultBoolean = false)
    public void setDisabled(WalletButtonView view, boolean disabled) {
        view.setDisabled(disabled);
    }

    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.of(PRESS_EVENT, MapBuilder.of("registrationName", "onPress"));
    }

    @Override
    public void onDropViewInstance(WalletButtonView view) {
        view.setDisabled(true);
        view.setOnClickListener(null);
        super.onDropViewInstance(view);
    }

    public static final class WalletButtonView extends FrameLayout {
        // Rendering descriptor mirrors the existing NiSdkModule support/payment
        // allowlist. It contains no merchant, gateway, amount or token data and
        // is not a readiness check or a payment request.
        private static final String BUTTON_PAYMENT_METHODS =
                "[{\"type\":\"CARD\",\"parameters\":{\"allowedAuthMethods\":[\"PAN_ONLY\",\"CRYPTOGRAM_3DS\"],"
                        + "\"allowedCardNetworks\":[\"VISA\",\"MASTERCARD\"]}}]";

        private final PayButton payButton;
        private boolean disabled = true;

        WalletButtonView(ThemedReactContext context) {
            super(context);
            payButton = new PayButton(context);
            int radius = Math.round(8 * getResources().getDisplayMetrics().density);
            payButton.initialize(ButtonOptions.newBuilder()
                    .setButtonTheme(ButtonConstants.ButtonTheme.DARK)
                    .setButtonType(ButtonConstants.ButtonType.PLAIN)
                    .setCornerRadius(radius)
                    .setAllowedPaymentMethods(BUTTON_PAYMENT_METHODS)
                    .build());
            // React owns one accessible button and its label. The child provides
            // official artwork; accessibility activation uses performClick().
            payButton.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            addView(payButton, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
            setFocusable(true);
            setClickable(true);
            setDisabled(true);
        }

        boolean isDisabled() {
            return disabled;
        }

        void setDisabled(boolean value) {
            disabled = value;
            setEnabled(!value);
            payButton.setEnabled(!value);
            payButton.setAlpha(value ? 0.5f : 1f);
            payButton.setOnClickListener(value ? null : ignored -> performClick());
        }

        @Override
        public boolean onInterceptTouchEvent(MotionEvent event) {
            return disabled || super.onInterceptTouchEvent(event);
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            return disabled || super.onTouchEvent(event);
        }
    }
}
