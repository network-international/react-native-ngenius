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
- **Delivery resolved:** `saved-tokens-api.json` (received 9 Oct 2026),
  `GET /api/outlets/{outletRef}/tokens`, returns `{ tokens, tncUrl? }`. This does
  **not** establish `order.tncUrl`, `orderData.tncUrl`, a public URL prop, or a
  URL-provider contract.
- Agreed semantics: `consentOff === true` hides consent and needs no `tncUrl`;
  `consentOff` false or omitted returns `tncUrl`. Zero tokens is valid
  (`{ tokens: [], tncUrl }`). The supplied JSON still says `tncUrl` is returned
  for `consentOff=true` and that `tokens` is required; both need a backend-side
  correction.

RN makes no PayPage/config HTTP request for consent. The source audit above
explains backend ownership. The only call is the saved-tokens endpoint through
the merchant-supplied tokenization client, authenticated with `Access-Token`.
No PayPage session status or `PAYPAGE_SESSION_UNAVAILABLE` remains in production code.

## Component loading and demo

When `tokenizationClient` and `outletRef` are supplied and consent is on, the
component calls `getSavedTokens({ outletRef })` each time it opens and keeps the
returned `tncUrl` in component state for that open only. Closing clears it, so a
reopened modal never reuses a previous destination. There is no global URL cache.
With consent off, no request is made.

`SimpleIntegration/src/app.js` passes a DEMO-ONLY client whose in-memory transport
answers saved tokens with `{ tokens: [], tncUrl }`, using
`https://example.com/?demo=tokenization&locale=en#terms`, and fails every other
endpoint. It is not exported by the SDK/package, makes no network call, and is not
production T&C. Screenshots validate the UI; live backend delivery of `tncUrl`
remains unverified.

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
invalid URLs, a pending request and a failed request leave the NI consent visible
and Terms plain. Diagnostics are emitted after the request settles and contain
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

Existing payment exports are unchanged. Card and Apple Pay open the existing NISdk
screens and return `niTokenCreated: false`; they are not create-token operations.
Google Pay with a tokenization client sends the wallet token to `POST /wallets`.
Target card boundary: RN UI → native secure capture → `POST /cards` from native →
`SavedCardResponse`. PAN/CVV must never cross the RN JS bridge.

## Production follow-ups

- Backend correction of the `consentOff` / `tokens` wording in
  `saved-tokens-api.json`; validate live `tncUrl` delivery.
- Confirmed tokenization base URLs.
- Native secure `POST /cards` and Apple Pay token access in the iOS bridge.
- Native 3DS runner for `AWAIT_3DS`.
- JWE `encryptedPayload` for cards remains out of scope. The POC adds no `keyId`,
  `publicKey` payload field, publicKey component prop, or crypto format.
- MCP.

See [implementation and validation notes](tokenization-implementation.md).
