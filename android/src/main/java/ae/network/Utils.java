package ae.network;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;

import java.util.ArrayList;
import java.util.List;

import payment.sdk.android.core.Order;
import payment.sdk.android.core.PaymentResponse;

public class Utils {
    private static PaymentResponse.Href getHrefFromLinks(ReadableMap linksMap, String urlKey) {
        PaymentResponse.Href href = new PaymentResponse.Href();
        ReadableMap urlMap = linksMap.getMap(urlKey);
        if (urlMap != null) {
            href.setHref(urlMap.getString("href"));
            return href;
        }
        return null;
    }

    public static PaymentResponse buildPaymentResponseFromReadableMap(ReadableMap paymentResponseMap) {
        PaymentResponse paymentResponse = new PaymentResponse();
        paymentResponse.setOrderReference(paymentResponseMap.getString("orderReference"));
        paymentResponse.setAuthenticationCode(paymentResponseMap.getString("authenticationCode"));
        paymentResponse.setOutletId(paymentResponseMap.getString("outletId"));
        paymentResponse.setReference(paymentResponseMap.getString("reference"));

        ReadableMap linksMap = paymentResponseMap.getMap("_links");
        if (linksMap != null) {
            PaymentResponse.Links links = new PaymentResponse.Links();
            links.setPaymentAuthorizationUrl(getHrefFromLinks(linksMap, "self"));
            links.setPaymentUrl(getHrefFromLinks(linksMap, "self"));
            links.setThreeDSAuthenticationsUrl(getHrefFromLinks(linksMap, "cnp:3ds2-authentication"));
            links.setThreeDSChallengeResponseUrl(getHrefFromLinks(linksMap, "cnp:3ds2-challenge-response"));
            paymentResponse.setLinks(links);
        }

        ReadableMap threeDSTwoMap = paymentResponseMap.getMap("3ds2");
        if(threeDSTwoMap != null) {
            PaymentResponse.ThreeDSTwo threeDSTwo = new PaymentResponse.ThreeDSTwo();
            threeDSTwo.setMessageVersion(threeDSTwoMap.getString("messageVersion"));
            threeDSTwo.setThreeDSMethodURL(threeDSTwoMap.getString("threeDSMethodURL"));
            threeDSTwo.setThreeDSServerTransID(threeDSTwoMap.getString("threeDSServerTransID"));
            threeDSTwo.setDirectoryServerID(threeDSTwoMap.getString("directoryServerID"));
            paymentResponse.setThreeDSTwo(threeDSTwo);
        }

        return paymentResponse;
    }

    public static Order constructOrderFromReadableMap(ReadableMap orderMap) {
        Order order = new Order();

        // Outlet and referenceID
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
