# PayPage T&C source and RN integration status

Source refs inspected:

- `paypage-app-2`: `origin/master` at
  `1d37b89bc43762e2cca1a0279ae57d04ca45b3ac`.
- `paypage-frontend-service`: `origin/master` at
  `fdd3ddfcae3a08c80e4d9b7b50c2b0538bcf60dc`.

The backend at this commit has a transaction-order fallback described below.

## Exact source chain

Backend paths are relative to `paypage-frontend-service` at the pinned commit.

1. `paypage-frontend-service-app/src/main/java/ae/network/nextgen/paypage/config/ConfigServiceConfigurationBean.java`,
   `uriForTncUrl(outletRef)`, builds
   `GET {config-service.baseUri}/outlets/{outletRef}/configs/invoice`.
   `application.yml` sets the internal base to `http://config-service/config` and
   media type to `application/vnd.ni-config.v1+json`. Thus the internal path is
   `/config/outlets/{outletRef}/configs/invoice`. This is **invoice configuration**,
   not `/configs/merchant-brand`, `/configs/tenant-brand`, or BrandingResponse.
2. `config-service-adapter/src/main/java/ae/network/nextgen/paypage/config/ConfigServiceAdapter.java`,
   `getTncUrl(authToken, outletRef)`, performs the authenticated config GET,
   deserializes a `Map`, and reads the exact `tncUrl` field. Current master caches
   non-null results by outlet. No language parameter or locale mapping is present.
3. `paypage-frontend-service-domain/src/main/java/ae/network/nextgen/paypage/domain/transaction/TransactionServiceInteractor.java`,
   `getOrder(...)`, calls `configService.getTncUrl(configToken, outletRef)` and
   `transactionService.getOrder(paymentToken, outletRef, orderRef)`.
   `getPayPageResponse(...)` uses the nonblank config URL first, otherwise
   `originalOrder.getTermsAndConditions()`, then `.withTncUrl(termsAndConditions)`.
   This precedence must remain on the backend. A config exception does not enter
   the blank-config fallback: `getTncUrl` is called without a catch here.
4. `paypage-frontend-service-api/src/main/java/ae/network/nextgen/paypage/api/order/PayPageResponse.java`
   contains `String tncUrl`. `paypage-frontend-service-rest/src/main/java/ae/network/nextgen/paypage/rest/resources/OrderResource.java`
   returns it from `GET /api/outlets/{outletRef}/orders/{orderRef}`, taking
   `Access-Token` (config token) and `Payment-Token` headers. Its currency and
   globalBlueId query parameters are unrelated to selecting the terms URL.
5. Backend verification:
   `paypage-frontend-service-domain/src/test/java/ae/network/nextgen/paypage/domain/transaction/TransactionServiceInteractorTest.java`
   tests `shouldGetOrderWithTncUrlFromOrderResponse`,
   `shouldGetOrderWithTncUrlFromConfigEvenIfAvailableInOrderResponse`, and
   `shouldGetOrderWithOutTncUrl`. Some fixtures are schemeless `www...` strings;
   they verify source precedence, not safe hyperlink behavior.

Frontend paths are relative to `paypage-app-2` at the pinned commit.

6. `src/api/Config/baseConfig.ts` sets base URL `/api`. Its token interceptor adds
   `Authorization: Bearer <accessToken>`, `Access-Token`, and `Payment-Token`.
   `src/api/Config/AxiosInstance.ts` installs that client.
7. `src/api/client.ts`, `orders.getOrder`, GETs
   `/outlets/${outletRef}/orders/${orderRef}` and returns `response.data` directly.
   `src/api/types.ts`, `OrderResponse.tncUrl?: string`, describes the field.
   There is no frontend URL mapper or branding-derived override.
8. `src/api/hooks.ts`, `useOrder`, calls `orders.getOrder`.
   `src/pages/PaymentLayout/PaymentLayout.tsx` calls `useOrder` and writes the
   response to `AppProvider`'s `orderDetails` context. It separately calls the
   branding API for the theme. CardForm and WalletSection read context through
   TnC; they do not make a separate terms/config/branding request.
9. `src/components/TnC/TnC.tsx` reads `orderDetails.tncUrl`. It returns `null` if
   that value is falsy. Ordinary text renders an `<a href={orderDetails.tncUrl}>`
   with the `PAYMENT_DISCLAIMER_2` label between `_1` and `_3`.
   Recurring variants pass `{termsOfUse}`, localized `TERMS_OF_USE`, and the same
   URL to `src/components/RichTextWithLinks/RichTextWithLinks.tsx`, which renders
   each token as an anchor with `target="_blank"` and `rel="noopener noreferrer"`.
10. `src/pages/PaymentLayout/components/PaymentOptions/components/WalletSection/WalletSection.tsx`
    places TnC below the wallet group and before the divider.
    `src/pages/PaymentLayout/components/PaymentOptions/components/CardForm/CardForm.tsx`
    places it below the card action. `src/components/TnC/styles.module.scss`
    makes links inherit the text color. RN preserves the white-label font/color,
    13px/16px geometry and underline treatment.

## Final delivery decision — confirmed by Andrei

- **Ownership resolved:** consent copy belongs to NI, never merchant text.
- **Source resolved:** invoice config `tncUrl`, falling back to transaction
  `termsAndConditions`, resolved on backend using the audited PayPage logic above.
- **Delivery architecture resolved:** backend returns the final `tncUrl` in the
  FIRST response used to initialise/start tokenization when consent is enabled.
  The exact response/container is still being defined. This does **not** establish
  `order.tncUrl`, `orderData.tncUrl`, a public URL prop, or a URL-provider contract.
- When `consentOff === true`, backend need not return a URL and RN does not read it.

RN makes no PayPage/config HTTP request or separate authentication for consent.
The source audit above explains backend ownership, not a transport for RN to call.
No PayPage session status or `PAYPAGE_SESSION_UNAVAILABLE` remains in production code.

## Internal adapter and demo

`TokenizationBootstrapContext` is internal, absent from `index.js`. It contains a
session-scoped `resolvedTncUrl`, associated with the current native order object.
A future internal init adapter maps the agreed backend response into this model.
No final response shape is guessed and no service call is implemented. Mount a
fresh provider per initialisation and clear it on close; a provider associated
with a different order cannot supply a URL. There is no global URL cache.

`SimpleIntegration/src/app.js — DemoTokenizationBootstrap` is a LOCAL VISUAL FIXTURE.
It supplies `https://example.com/?demo=tokenization&locale=en#terms` through that
internal context, never an order field or public merchant prop. It is not exported
by the SDK/package and is not production T&C or a backend response contract.
The demo mounts it only while tokenization is open, then unmounts/clears the order.
Screenshots validate the UI; live backend delivery of `tncUrl` remains pending.

## Consent and link behavior

Only strict `consentOff === true` removes consent, link and reserved space.
False, omitted and invalid values retain NI-owned localized PayPage copy.
`customizedMessage` is unrelated and cannot replace it.

- Standard or missing order: `PAYMENT_DISCLAIMER_1/2/3`.
- `RECURRING` plus `merchantAttributes.paymentModel === 'subscription'`:
  `SUBSCRIPTION_TERMS_AND_CONDITIONS`.
- `INSTALLMENT` plus the same model: `INSTALLMENT_TERMS_AND_CONDITIONS`.
- `UNSCHEDULED` reusable: `UNSCHEDULED_TERMS_AND_CONDITIONS`, retaining complete
  PayPage copy plus the previously required localized `TERMS_OF_USE` reference.
- `isSaudiPaymentEnabled === true` selects standard copy.

These are the existing PayPage `subscriptionOrderUtils.ts` selectors, not new
aliases. EN/FR/AR copy is checked against source fixtures. Arabic uses RTL.

Valid absolute HTTP(S) URLs use guarded `Linking.canOpenURL` then `openURL`;
query parameters, encoding and fragments remain verbatim. Malformed, schemeless,
relative, credential-bearing and non-web URLs never reach Linking. Missing or
invalid URLs leave the NI consent visible and Terms plain. Diagnostics contain
only `TERMS_URL_MISSING` / `TERMS_URL_INVALID`, with no shopper technical error,
URL, credentials or order data. Consent off skips URL consumption and diagnostics.

## Methods and security boundary

Explicit `paymentMethods` is the merchant allowlist of `CARD`, `APPLE_PAY`,
`GOOGLE_PAY`; native platform/capability further filters wallets. Unsupported
methods (including Samsung, APMs and split settlement) cannot appear here.
The final omitted-prop contract is still undefined. For compatibility the POC
preserves the existing POC order-based fallback (card defaults on; wallets depend
on device capability and any supplied order lists). It is not a new Product default;
all demo scenarios pass an explicit list.

The V1 API client and existing payment exports are unchanged. UI create calls are
not wired. Current POC opens existing NISdk payment/capture screens, returning
`niTokenCreated: false`; it is not a create-token operation. Target boundary:
RN UI → native secure capture → future service call → PaymentMethodResponse/tokenRef.
PAN/CVV must never cross the RN JS bridge.

## Production follow-ups

- Exact tokenization-init response/container containing resolved `tncUrl` and its
  internal mapping; validate live backend delivery and missing/failure handling.
- Native secure create-token operation and live Card/Wallet token creation.
- Inspect current NISdk/payment-sdk encryption and align the native tokenization
  payload with the existing crypto contract. Product v5 lists optional `publicKey`,
  but envelope/key management remain unverified. The POC adds no `keyId`,
  `publicKey` Card payload field, publicKey component prop, or crypto format.
- Mobile authentication/key placement agreement for live service calls.
- MCP and new 3DS integration.

See [implementation and validation notes](tokenization-implementation.md).
