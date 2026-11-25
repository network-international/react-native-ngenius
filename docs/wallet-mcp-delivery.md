# Wallet tokenization and MCP delivery

Status reviewed on 25 November 2026. These are delivery dependencies, not a claim of completed wallet or MCP support.

## Confirmed integration

- The merchant backend creates the session. The SDK gets order data and enabled methods from Get Session; initialization cannot supply a replacement amount.
- Apple Pay capture runs on iOS and Google Pay capture on Android. Capture uses zero in the current session currency; merchant payment remains a separate backend operation.
- Wallet buttons require both native readiness and an explicitly capable Add Wallet adapter. The built-in client remains disabled until its session endpoint is confirmed.
- Explicit Apple `supportedNetworks` and Google `allowedCardNetworks` are native capture settings, separate from `paymentMethods.card`. A wallet-only outlet's empty card list does not establish which networks its wallet can use. The session delivery shape for wallet settings still requires confirmation.
- Specification v29 now documents `PUT /api/outlets/{outletRef}/payment-tokenization-sessions/{sessionRef}/selected-payment-data` and a `{ tokenRef, currency }` example; the BFF DTO keeps currency optional. SDK `selectToken` already uses this route, with no automatic legacy-route retry.
- Get Session has a boolean `isMcpSelected`. The client preserves explicit booleans. It does not turn this into MCP eligibility, a selected currency, or a rate.

## Backend contracts required

| Area | Required evidence | Why it is needed |
| --- | --- | --- |
| Add Wallet | Session route, SDK authorization, request and success/error examples, verification outcomes | Submit the opaque native token and associate the resulting token with the same session |
| Wallet configuration | Apple and Google public settings delivered for the outlet/session, including permitted wallet networks | Open the correct native sheet without moving business configuration into SDK initialization |
| MCP initialization | Explicit eligibility/configuration and the authorized currency-list/quote operations | Load applicable currencies without treating an unselected flag as disabled MCP |
| MCP state | Selected currency/quote in Get Session, validity rules and the merchant callback shape | Restore the shopper's choice and keep displayed and persisted currency consistent |
| UAT | Eligible token and configured outlet for successful selection/currency persistence, plus wallet and MCP setup | The route is reachable; the negative route check is not proof of successful persistence or payment |

The older generic save-wallet diagram returns a single token reference and does not define a session route. Add Card's `encryptedPayload` is a card JWE alternative to the card object; it must not be reused for Apple/Google payloads without a backend contract.

Existing PayPage MCP retrieves currencies and quotes through Forex APIs. The tokenization token's authority to call those APIs and the required session context have not been established. Existing PayPage applies MCP to eligible card SALE/PURCHASE flows and restores the original currency when switching to a wallet. Those rules must be preserved; the current AUTH card demo is not evidence of MCP eligibility.

## UAT check after specification v29

The active Anzhelika UAT environment returned HTTP 200 for both credential refreshes, 201 for Create Session, and 200 for Get Session. Get Session returned `advisedTokens: []`, `paymentMethods: {}`, and the requested AUTH order amount/summary. A PUT to the new route with a UUID outside that empty session and the session currency returned the expected HTTP 400 `tokenNotInSession`. No token was selected and no merchant Pay was submitted. The normal Postman request was restored after this negative check.

This confirms route availability and a session membership rejection. It does not confirm successful currency persistence. The outlet still requires usable payment configuration and an eligible session token. No session Add Wallet or MCP lookup/quote contract was added in specification v29.

## Remaining implementation and acceptance

1. Implement the confirmed Add Wallet transport and session-delivered public configuration, then test capture cancellation, declined verification, malformed responses, expired sessions and late callbacks.
2. Connect confirmed MCP configuration and quote operations. Add loading, empty, unavailable and expired-quote states using server-supplied amounts; do not calculate exchange rates locally.
3. Keep currency selection within one session through card entry and Back; clear it when the session changes. Save `{ tokenRef, currency }` only after a valid choice and confirmed token, and hand control back to the merchant after acknowledgment.
4. Verify new and saved cards, wallet switching, no-MCP outlets, zero/three-decimal currencies, and stale responses from previous sessions.
5. Verify Apple Pay on a provisioned iPhone and Google Pay on an eligible Android device. Simulator previews are not wallet acceptance.
6. Complete merchant Pay with and without 3DS and verify final Get Order data. SDK selection success remains distinct from payment success.

The existing card demo stays on its original branch and installed build while this work is developed separately.
