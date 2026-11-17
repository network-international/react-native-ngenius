/**
 * QPay (QCB / NAPS, Qatar) — the gateway side of the flow, no UI and no React Native imports.
 *
 * Mirrors the native SDKs (Android `QPayActivity`, iOS `QPayViewController`):
 *  1. Authorise with the order's `payment-authorization` link → access token.
 *  2. POST `{}` to `payment:qpay` → the form fields QCB's hosted page expects + `redirectUri`.
 *  3. Auto-submit those fields to QCB from a page whose base URL is the order's paypage origin:
 *     QCB only accepts the POST from that whitelisted origin.
 *  4. The payer pays on QCB's page. QCB posts back to the gateway's `/qpay/accept` (paid or
 *     declined) or to its own `/d3gw/cancel` (payer cancelled).
 *  5. After the accept, read the order for the final state.
 */

import { GatewayError, call, firstPayment, href, originOf, sessionLinks } from './gateway-core';

export { authorize, pollResult } from './gateway-core';

/** True when the outlet offers QPay on this order (a QAR order with a `payment:qpay` link). */
export function isQPayAvailable(order) {
  return qpayConfig(order) !== undefined;
}

/** Everything needed to run a QPay checkout, or `undefined` when the order does not offer it. */
export function qpayConfig(order) {
  const amount = order && order.amount;
  if (!amount || String(amount.currencyCode || '').toUpperCase() !== 'QAR') return undefined;
  const payment = firstPayment(order);
  const initUrl = href(payment && payment._links && payment._links['payment:qpay']);
  const session = sessionLinks(order);
  const baseUrl = session && originOf(session.payPage);
  if (!initUrl || !session || !baseUrl) return undefined;
  return {
    authUrl: session.authUrl,
    authCode: session.authCode,
    orderUrl: session.orderUrl,
    initUrl,
    baseUrl: `${baseUrl}/`,
  };
}

/** The gateway's callback once QCB has a result (paid or declined). */
export const isAcceptUrl = (url) => typeof url === 'string' && url.includes('/qpay/accept');

/** QCB's own cancel endpoint: the payer chose Cancel on QCB's page. */
export const isCancelUrl = (url) => typeof url === 'string' && url.includes('/d3gw/cancel');

/** Field order QCB expects, as the native SDKs and the hosted paypage send it. */
const FIELDS = [
  'Amount', 'CurrencyCode', 'PUN', 'MerchantModuleSessionID', 'PaymentDescription', 'NationalID', 'MerchantID',
  'BankID', 'Lang', 'Action', 'SecureHash', 'TransactionRequestDate', 'ExtraFields_f14', 'Quantity',
];

/**
 * Starts the checkout → the auto-submitting HTML to load. Throws 'Aborted' when the gateway says
 * the payment was cancelled, 'Unavailable' when QPay will not open.
 */
export async function startCheckout(config, token, fetchImpl = fetch) {
  let json;
  try {
    // The body must be `{}`: the gateway rejects a missing one ("initiatePaymentRequest is null").
    ({ json } = await call(fetchImpl, config.initUrl, 'POST', { token, body: {} }));
  } catch (e) {
    if (e.httpStatus === 401) throw new GatewayError('Failed', 'The payment session has expired. Start a new order to pay.', 401);
    throw new GatewayError('Unavailable', e.message, e.httpStatus);
  }
  const body = json || {};
  if (body.cancelled === true) throw new GatewayError('Aborted', 'QPay checkout was cancelled.');
  const html = autoSubmitHtml(body);
  if (!html) throw new GatewayError('Unavailable', 'QPay is not available for this order.');
  return { html };
}

/** QCB rejects look-alike Unicode dashes in its URL; swap them for ASCII '-'. */
const normalizeDashes = (s) => s.replace(/[‐-―−﹘]/g, '-');

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function autoSubmitHtml(body) {
  const action = typeof body.redirectUri === 'string' && body.redirectUri ? normalizeDashes(body.redirectUri) : undefined;
  if (!action) return undefined;
  // QCB sends some fields as numbers (Amount, Quantity); every field is posted as a string.
  const inputs = FIELDS.map((name) => {
    const v = body[name];
    const value = v === undefined || v === null ? '' : String(v);
    return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;
  }).join('\n');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QPay</title></head>
<body>
<form id="QPayRedirectForm" method="post" action="${escapeHtml(action)}">
${inputs}
</form>
<script>document.getElementById('QPayRedirectForm').submit();</script>
</body></html>`;
}
