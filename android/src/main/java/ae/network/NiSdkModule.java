package ae.network;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReadableMap;

import org.jetbrains.annotations.NotNull;

import java.util.List;
import java.util.Objects;

import payment.sdk.android.PaymentClient;
import payment.sdk.android.SDKConfig;
import payment.sdk.android.core.Order;
import payment.sdk.android.cardpayment.CardPaymentData;
import payment.sdk.android.cardpayment.CardPaymentRequest;
import payment.sdk.android.core.PaymentResponse;
import payment.sdk.android.samsungpay.SamsungPayResponse;

public class NiSdkModule extends ReactContextBaseJavaModule implements SamsungPayResponse {

    private final ReactApplicationContext reactContext;
    private final int CARD_ACTIVITY_REQUEST_CODE = 00765;
    private final int EXECUTE_THREE_DS_TWO_ACTIVITY_REQUEST_CODE = 00654;
    private Callback cardPayResponseCallback;
    private Callback samsungPayResponseCallback;
    private Callback executeThreeDSTwoCallback;
    private Callback isSamsungPayEnabledCallback;

    private final ActivityEventListener cardActivityEventListener = new BaseActivityEventListener() {

        @Override
        public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
            if ((requestCode == CARD_ACTIVITY_REQUEST_CODE && cardPayResponseCallback != null) ||
                    (requestCode == EXECUTE_THREE_DS_TWO_ACTIVITY_REQUEST_CODE && executeThreeDSTwoCallback != null)) {
                Callback cb = requestCode == CARD_ACTIVITY_REQUEST_CODE ? cardPayResponseCallback : executeThreeDSTwoCallback;
                // This is the card payment intent
                if (resultCode == Activity.RESULT_OK) {
                    CardPaymentData cardPaymentData = CardPaymentData.getFromIntent(data);
                    switch (cardPaymentData.getCode()) {
                        case CardPaymentData.STATUS_PAYMENT_AUTHORIZED:
                        case CardPaymentData.STATUS_PAYMENT_PURCHASED:
                        case CardPaymentData.STATUS_PAYMENT_CAPTURED:
                            // Payment succeeded
                            cb.invoke("Success");
                            break;
                        case CardPaymentData.STATUS_PAYMENT_FAILED:
                        case CardPaymentData.STATUS_GENERIC_ERROR:
                        default:
                            // Unknown error
                            cb.invoke("Failed");
                            break;
                    }
                } else if (resultCode == Activity.RESULT_CANCELED) {
                    // User aborted
                    cb.invoke("Aborted");
                }
            }
        }
    };

    public NiSdkModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        reactContext.addActivityEventListener(cardActivityEventListener);
    }

    @Override
    public String getName() {
        return "NiSdk";
    }

    @ReactMethod
    public void initiateCardPaymentUI(ReadableMap orderResponse, Callback cardPayResponseCallback) {
        PaymentClient paymentClient = new PaymentClient(Objects.requireNonNull(this.getCurrentActivity()), "");
        ReadableMap links = orderResponse.getMap("_links");
        String paymentAuthorizationLink = links.getMap("payment-authorization").getString("href");
        String paymentLink = links.getMap("payment").getString("href");
        Uri uri = Uri.parse(paymentLink);
        String authCode = uri.getQueryParameter("code");
        this.cardPayResponseCallback = cardPayResponseCallback;

        CardPaymentRequest cardPaymentRequest = new CardPaymentRequest
                .Builder()
                .gatewayUrl(paymentAuthorizationLink)
                .code(authCode)
                .build();
        paymentClient.launchCardPayment(cardPaymentRequest, CARD_ACTIVITY_REQUEST_CODE);
    }

    @ReactMethod
    public void configureSDK(ReadableMap config) {
        Boolean shouldShowOrderAmount = config.getBoolean("shouldShowOrderAmount");
        SDKConfig.INSTANCE.shouldShowOrderAmount(shouldShowOrderAmount);
    }

    @ReactMethod
    public void executeThreeDSTwo(ReadableMap paymentResponseMap, Callback executeThreeDSTwoCallback) {
        this.executeThreeDSTwoCallback = executeThreeDSTwoCallback;
        PaymentClient paymentClient = new PaymentClient(Objects.requireNonNull(this.getCurrentActivity()), "");
        PaymentResponse paymentResponse = Utils.buildPaymentResponseFromReadableMap(paymentResponseMap);
        paymentClient.executeThreeDS(paymentResponse, EXECUTE_THREE_DS_TWO_ACTIVITY_REQUEST_CODE);
    }

    @ReactMethod
    public void initiateSamsungPay(ReadableMap orderResponse, String merchantName, String serviceId, Callback samsungPayResponseCallback) {
        PaymentClient paymentClient = new PaymentClient(Objects.requireNonNull(this.getCurrentActivity()), serviceId);
        Order order = Utils.constructOrderFromReadableMap(orderResponse);
        this.samsungPayResponseCallback = samsungPayResponseCallback;
        paymentClient.launchSamsungPay(order, merchantName, this);
    }

    private final PaymentClient.SupportedPaymentTypesListener supportedPaymentTypesListeners =
            new PaymentClient.SupportedPaymentTypesListener() {
                @Override
                public void onReady(@NotNull List<? extends PaymentClient.PaymentType> list) {
                    boolean samsungPayEnabled = false;
                    for (PaymentClient.PaymentType type : list) {
                        if (type == PaymentClient.PaymentType.SAMSUNG_PAY) {
                            samsungPayEnabled = true;
                        }
                    }
                    isSamsungPayEnabledCallback.invoke(samsungPayEnabled);
                }
            };

    @ReactMethod
    public void isSamsungPayEnabled(String serviceId, Callback isSamsungPayEnabledCallback) {
        PaymentClient paymentClient = new PaymentClient(Objects.requireNonNull(this.getCurrentActivity()), serviceId);
        this.isSamsungPayEnabledCallback = isSamsungPayEnabledCallback;
        paymentClient.getSupportedPaymentMethods(supportedPaymentTypesListeners);
    }

    @Override
    public void onFailure(@NotNull String s) {
        if (this.samsungPayResponseCallback != null) {
            this.samsungPayResponseCallback.invoke("Failed", s);
        }
    }

    @Override
    public void onSuccess() {
        if (this.samsungPayResponseCallback != null) {
            this.samsungPayResponseCallback.invoke("Success");
        }
    }
}
