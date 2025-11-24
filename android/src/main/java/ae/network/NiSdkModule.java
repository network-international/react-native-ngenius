package ae.network;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import org.jetbrains.annotations.NotNull;

import java.util.List;
import java.util.Objects;

import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.wallet.AutoResolveHelper;
import com.google.android.gms.wallet.IsReadyToPayRequest;
import com.google.android.gms.wallet.PaymentData;
import com.google.android.gms.wallet.PaymentDataRequest;
import com.google.android.gms.wallet.PaymentsClient;
import com.google.android.gms.wallet.Wallet;
import com.google.android.gms.wallet.WalletConstants;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

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
    private final int GOOGLE_PAY_REQUEST_CODE = 888;
    private Callback cardPayResponseCallback;
    private Callback samsungPayResponseCallback;
    private Callback executeThreeDSTwoCallback;
    private Callback isSamsungPayEnabledCallback;
    private Callback googlePayResponseCallback;
    private PaymentsClient paymentsClient;

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
            } else if (requestCode == GOOGLE_PAY_REQUEST_CODE && googlePayResponseCallback != null) {
                Callback cb = googlePayResponseCallback;
                switch (resultCode) {
                    case Activity.RESULT_OK:
                        if (data != null) {
                            PaymentData paymentData = PaymentData.getFromIntent(data);
                            if (paymentData != null) {
                                try {
                                    String paymentInfo = paymentData.toJson();
                                    if (paymentInfo != null) {
                                        JSONObject paymentJson = new JSONObject(paymentInfo);
                                        JSONObject paymentMethodData = paymentJson.getJSONObject("paymentMethodData");
                                        JSONObject tokenizationData = paymentMethodData.getJSONObject("tokenizationData");
                                        String token = tokenizationData.getString("token");
                                        cb.invoke("Success", token);
                                    } else {
                                        cb.invoke("Failed", "Empty payment data");
                                    }
                                } catch (JSONException e) {
                                    cb.invoke("Failed", "Failed to parse payment data: " + e.getMessage());
                                }
                            } else {
                                cb.invoke("Failed", "Payment data is null");
                            }
                        } else {
                            cb.invoke("Failed", "Intent data is null");
                        }
                        break;
                    case Activity.RESULT_CANCELED:
                        cb.invoke("Aborted", "User cancelled");
                        break;
                    case AutoResolveHelper.RESULT_ERROR:
                        if (data != null) {
                            com.google.android.gms.common.api.Status status = AutoResolveHelper.getStatusFromIntent(data);
                            cb.invoke("Failed", status != null ? status.getStatusMessage() : "Unknown error");
                        } else {
                            cb.invoke("Failed", "Error occurred");
                        }
                        break;
                    default:
                        cb.invoke("Failed", "Unknown result code: " + resultCode);
                        break;
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
    public void getDeviceInfo(Callback callback) {
        try {
            String manufacturer = Build.MANUFACTURER;
            String model = Build.MODEL;
            int osVersion = Build.VERSION.SDK_INT;
            
            WritableMap deviceInfo = Arguments.createMap();
            deviceInfo.putString("manufacturer", manufacturer);
            deviceInfo.putString("model", model);
            deviceInfo.putInt("osVersion", osVersion);
            deviceInfo.putString("platform", "android");
            
            callback.invoke(deviceInfo);
        } catch (Exception e) {
            WritableMap error = Arguments.createMap();
            error.putString("error", e.getMessage());
            callback.invoke(error);
        }
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

    private PaymentsClient createPaymentsClient(int environment) {
        Wallet.WalletOptions walletOptions = new Wallet.WalletOptions.Builder()
                .setEnvironment(environment)
                .build();
        return Wallet.getPaymentsClient(this.reactContext, walletOptions);
    }

    @ReactMethod
    public void isGooglePaySupported(ReadableMap googlePayConfig, Callback callback) {
        try {
            if (googlePayConfig == null) {
                callback.invoke(false);
                return;
            }

            String environment = googlePayConfig.hasKey("environment") ? 
                    googlePayConfig.getString("environment") : "TEST";
            int walletEnvironment = "PRODUCTION".equals(environment) ? 
                    WalletConstants.ENVIRONMENT_PRODUCTION : WalletConstants.ENVIRONMENT_TEST;

            PaymentsClient paymentsClient = createPaymentsClient(walletEnvironment);

            JSONObject isReadyToPayRequestJson = new JSONObject();
            isReadyToPayRequestJson.put("apiVersion", 2);
            isReadyToPayRequestJson.put("apiVersionMinor", 0);

            JSONArray allowedPaymentMethods = new JSONArray();
            JSONObject cardPaymentMethod = new JSONObject();
            cardPaymentMethod.put("type", "CARD");
            
            JSONObject parameters = new JSONObject();
            parameters.put("allowedAuthMethods", new JSONArray().put("PAN_ONLY").put("CRYPTOGRAM_3DS"));
            parameters.put("allowedCardNetworks", new JSONArray().put("VISA").put("MASTERCARD"));
            
            cardPaymentMethod.put("parameters", parameters);
            allowedPaymentMethods.put(cardPaymentMethod);
            
            isReadyToPayRequestJson.put("allowedPaymentMethods", allowedPaymentMethods);

            IsReadyToPayRequest request = IsReadyToPayRequest.fromJson(isReadyToPayRequestJson.toString());
            
            Task<Boolean> task = paymentsClient.isReadyToPay(request);
            task.addOnCompleteListener(completedTask -> {
                try {
                    boolean result = completedTask.getResult(ApiException.class);
                    callback.invoke(result);
                } catch (ApiException exception) {
                    callback.invoke(false);
                }
            });
        } catch (Exception e) {
            callback.invoke(false);
        }
    }

    @ReactMethod
    public void initiateGooglePay(ReadableMap googlePayConfig, ReadableMap orderDetails, Callback googlePayCallback) {
        try {
            if (googlePayConfig == null || orderDetails == null) {
                googlePayCallback.invoke("Failed", "Configuration or order details are missing");
                return;
            }

            Activity currentActivity = this.getCurrentActivity();
            if (currentActivity == null) {
                googlePayCallback.invoke("Failed", "Activity is null");
                return;
            }

            this.googlePayResponseCallback = googlePayCallback;

            String environment = googlePayConfig.hasKey("environment") ? 
                    googlePayConfig.getString("environment") : "TEST";
            int walletEnvironment = "PRODUCTION".equals(environment) ? 
                    WalletConstants.ENVIRONMENT_PRODUCTION : WalletConstants.ENVIRONMENT_TEST;

            this.paymentsClient = createPaymentsClient(walletEnvironment);

            JSONObject paymentDataRequestJson = new JSONObject();
            paymentDataRequestJson.put("apiVersion", 2);
            paymentDataRequestJson.put("apiVersionMinor", 0);

            JSONObject transactionInfo = new JSONObject();
            transactionInfo.put("totalPriceStatus", "FINAL");
            transactionInfo.put("totalPrice", orderDetails.getString("amount"));
            transactionInfo.put("currencyCode", orderDetails.getString("currencyCode"));
            paymentDataRequestJson.put("transactionInfo", transactionInfo);

            JSONObject merchantInfo = new JSONObject();
            merchantInfo.put("merchantName", googlePayConfig.getString("merchantName"));
            if (googlePayConfig.hasKey("merchantId")) {
                merchantInfo.put("merchantId", googlePayConfig.getString("merchantId"));
            }
            if (googlePayConfig.hasKey("merchantOrigin")) {
                merchantInfo.put("merchantOrigin", googlePayConfig.getString("merchantOrigin"));
            }
            paymentDataRequestJson.put("merchantInfo", merchantInfo);

            JSONArray allowedPaymentMethods = new JSONArray();
            JSONObject cardPaymentMethod = new JSONObject();
            cardPaymentMethod.put("type", "CARD");
            
            JSONObject parameters = new JSONObject();
            JSONArray allowedAuthMethods = new JSONArray();
            allowedAuthMethods.put("PAN_ONLY");
            allowedAuthMethods.put("CRYPTOGRAM_3DS");
            parameters.put("allowedAuthMethods", allowedAuthMethods);
            
            JSONArray allowedCardNetworks = new JSONArray();
            allowedCardNetworks.put("VISA");
            allowedCardNetworks.put("MASTERCARD");
            parameters.put("allowedCardNetworks", allowedCardNetworks);
            cardPaymentMethod.put("parameters", parameters);

            JSONObject tokenizationSpecification = new JSONObject();
            tokenizationSpecification.put("type", "PAYMENT_GATEWAY");
            JSONObject tokenizationParameters = new JSONObject();
            tokenizationParameters.put("gateway", googlePayConfig.getString("gateway"));
            tokenizationParameters.put("gatewayMerchantId", googlePayConfig.getString("gatewayMerchantId"));
            tokenizationSpecification.put("parameters", tokenizationParameters);
            cardPaymentMethod.put("tokenizationSpecification", tokenizationSpecification);
            
            allowedPaymentMethods.put(cardPaymentMethod);
            paymentDataRequestJson.put("allowedPaymentMethods", allowedPaymentMethods);

            PaymentDataRequest request = PaymentDataRequest.fromJson(paymentDataRequestJson.toString());
            
            if (request != null) {
                AutoResolveHelper.resolveTask(
                    paymentsClient.loadPaymentData(request),
                    currentActivity,
                    GOOGLE_PAY_REQUEST_CODE
                );
            } else {
                googlePayCallback.invoke("Failed", "Failed to create payment request");
            }
        } catch (JSONException e) {
            if (googlePayCallback != null) {
                googlePayCallback.invoke("Failed", "JSON error: " + e.getMessage());
            }
        } catch (Exception e) {
            if (googlePayCallback != null) {
                googlePayCallback.invoke("Failed", "Error: " + e.getMessage());
            }
        }
    }
}
