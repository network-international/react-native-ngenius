package com.reactlibrary;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.telecom.Call;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.google.gson.Gson;

import org.jetbrains.annotations.NotNull;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Objects;

import payment.sdk.android.PaymentClient;
import payment.sdk.android.core.Order;
import payment.sdk.android.cardpayment.CardPaymentData;
import payment.sdk.android.cardpayment.CardPaymentRequest;
import payment.sdk.android.samsungpay.SamsungPayResponse;

public class NiSdkModule extends ReactContextBaseJavaModule implements SamsungPayResponse {

    private final ReactApplicationContext reactContext;
    private final int CARD_ACTIVITY_REQUEST_CODE = 00765;
    private Callback cardPayResponseCallback;
    private Callback samsungPayResponseCallback;

    private final ActivityEventListener cardActivityEventListener = new BaseActivityEventListener() {

        @Override
        public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
            if(requestCode == CARD_ACTIVITY_REQUEST_CODE && cardPayResponseCallback != null) {
                // This is the card payment intent
                if(resultCode == Activity.RESULT_OK) {
                    CardPaymentData cardPaymentData = CardPaymentData.getFromIntent(data);
                    switch (cardPaymentData.getCode()) {
                        case CardPaymentData.STATUS_PAYMENT_AUTHORIZED:
                        case CardPaymentData.STATUS_PAYMENT_CAPTURED:
                            // Payment succeeded
                            cardPayResponseCallback.invoke("Success");
                            break;
                        case CardPaymentData.STATUS_PAYMENT_FAILED:
                        case CardPaymentData.STATUS_GENERIC_ERROR:
                        default:
                            // Unknown error
                            cardPayResponseCallback.invoke("Failed");
                            break;
                    }
                } else if(resultCode == Activity.RESULT_CANCELED) {
                    // User aborted
                    cardPayResponseCallback.invoke("Aborted");
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
        PaymentClient paymentClient = new PaymentClient(Objects.requireNonNull(this.getCurrentActivity()),"");
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
    public void initiateSamsungPay(ReadableMap orderResponse, String merchantName, String serviceId, Callback samsungPayResponseCallback) {
        PaymentClient paymentClient = new PaymentClient(Objects.requireNonNull(this.getCurrentActivity()),serviceId);
        Order order = this.constructOrderFromReadableMap(orderResponse);
        this.samsungPayResponseCallback = samsungPayResponseCallback;
        paymentClient.launchSamsungPay(order, merchantName, this);

    }

    @Override
    public void onFailure(@NotNull String s) {
        if(this.samsungPayResponseCallback != null) {
            this.samsungPayResponseCallback.invoke("Failed", s);
        }
    }

    @Override
    public void onSuccess() {
        if(this.samsungPayResponseCallback != null) {
            this.samsungPayResponseCallback.invoke("Success");
        }
    }

    private Order constructOrderFromReadableMap(ReadableMap orderMap) {
        Order order = new Order();

        // Outelt and referenceID
        order.setOutletId(orderMap.getString("outletId"));
        order.setReference(orderMap.getString("reference"));

        // Need to revisit this and add a builder to make it look better
        Order.Amount amount = new Order.Amount();
        amount.setCurrencyCode(orderMap.getMap("amount").getString("currencyCode"));
        amount.setValue(orderMap.getMap("amount").getInt("value"));
        order.setAmount(amount);

        // Set links
        Order.Links links = new Order.Links();

        Order.Href paymentHref = new Order.Href();
        Order.Href paymentAuthHref = new Order.Href();

        paymentHref.setHref(orderMap.getMap("_links").getMap("payment").getString("href"));
        paymentAuthHref.setHref(orderMap.getMap("_links").getMap("payment-authorization").getString("href"));

        links.setPaymentAuthorizationUrl(paymentAuthHref);
        links.setPaymentUrl(paymentHref);
        order.setLinks(links);

        // Set PaymentMethods
        Order.PaymentMethods paymentMethods = new Order.PaymentMethods();

        ReadableArray cardsArray = orderMap.getMap("paymentMethods").getArray("card");
        List<String> cards = new ArrayList<>();
        for (int i = 0; i < cardsArray.size(); i++) {
            cards.add(cardsArray.getString(i));
        }
        paymentMethods.setCard(cards);

        ReadableArray walletsArray = orderMap.getMap("paymentMethods").getArray("wallet");
        List<String> wallets = new ArrayList<>();
        for (int i = 0; i < walletsArray.size(); i++) {
            cards.add(walletsArray.getString(i));
        }
        paymentMethods.setWallet(wallets.toArray(new String[0]));

        order.setPaymentMethods(paymentMethods);

        // Set embeddedObject
        Order.PaymentLinks paymentLinks = new Order.PaymentLinks();
        Order.Href samsungPayHref = new Order.Href();
        samsungPayHref.setHref(
                orderMap.getMap("_embedded")
                        .getArray("payment")
                        .getMap(0)
                        .getMap("_links")
                        .getMap("payment:samsung_pay")
                        .getString("href")
        );

        paymentLinks.setSamsungPayLink(samsungPayHref);

        Order.Payment payment = new Order.Payment();
        payment.setLinks(paymentLinks);

        Order.Embedded embedded = new Order.Embedded();
        embedded.setPayment(new Order.Payment[]{payment});
        order.setEmbedded(embedded);
        return order;
    }
}
