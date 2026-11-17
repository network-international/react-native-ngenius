/**
 * Debit schemes paid on the scheme's own hosted page (KNET, Benefit) — the gateway side of the
 * flow, no UI and no React Native imports.
 *
 * Mirrors the native SDKs (Android `KnetActivity` / `BenefitActivity`, iOS `KnetViewController` /
 * `BenefitViewController`). The two are one integration that differs only in the facts in
 * `PROVIDERS`:
 *  1. Authorise with the order's `payment-authorization` link → access token.
 *  2. Re-read the order: an already-paid order is not started again, and a retry uses the
 *     payment's current link.
 *  3. POST `{}` to the payment's `payment:{scheme}` link → `{ paymentUrl, status: 'Initiated' }`.
 *  4. The payer pays on the scheme's page. The scheme reports to the gateway, which then sends the
 *     browser on to the paypage; that last hop is stopped, and the order decides the outcome.
 *
 * The payment is PENDING from the moment it is initiated, and the gateway accepts a new initiation
 * on a PENDING payment, so backing out leaves the order payable.
 */

import { GatewayError, call, firstPayment, href, readPayment, resultForState, sessionLinks } from './gateway-core';

export { authorize, pollResult, readPayment, resultForState } from './gateway-core';

export const PROVIDERS = {
  knet: {
    name: 'KNET',
    currency: 'KWD',
    segment: 'knet',
    // KNET is only offered when the gateway publishes the link.
    deriveLink: false,
    // Closing while PENDING lets the payer go: the order stays payable.
    holdWhilePending: false,
  },
  benefit: {
    name: 'Benefit',
    currency: 'BHD',
    segment: 'benefit',
    // Older gateways publish no `payment:benefit` rel; native derives it from the payment's `self`.
    deriveLink: true,
    cardScheme: 'BENEFIT',
    purchaseOnly: true,
    // Benefit may already be taking a PENDING payment, so closing then keeps the payer on the page
    // and points them at Benefit's own Cancel, which reaches the gateway, as the native SDKs do.
    holdWhilePending: true,
  },
};

/** The payment's checkout link, published or (where native does so) derived from its `self`. */
function checkoutLink(links, provider) {
  const published = href(links && links[`payment:${provider.segment}`]);
  if (published || !provider.deriveLink) return published;
  const self = href(links && links.self);
  return self ? `${self.replace(/\/+$/, '')}/${provider.segment}` : undefined;
}

export function isHostedAvailable(order, providerKey) {
  return hostedConfig(order, providerKey) !== undefined;
}

/** Everything needed to run the checkout, or `undefined` when the order does not offer it. */
export function hostedConfig(order, providerKey) {
  const provider = PROVIDERS[providerKey];
  if (!provider || !order) return undefined;
  const amount = order.amount;
  if (!amount || String(amount.currencyCode || '').toUpperCase() !== provider.currency) return undefined;
  if (provider.purchaseOnly && String(order.action || '').toUpperCase() !== 'PURCHASE') return undefined;
  if (provider.cardScheme) {
    const cards = (order.paymentMethods && order.paymentMethods.card) || [];
    if (!cards.some((c) => String(c).toUpperCase() === provider.cardScheme)) return undefined;
  }
  const payment = firstPayment(order);
  const initUrl = checkoutLink(payment && payment._links, provider);
  const session = sessionLinks(order);
  if (!initUrl || !session) return undefined;
  return { provider, authUrl: session.authUrl, authCode: session.authCode, orderUrl: session.orderUrl, initUrl };
}

const expired = () => new GatewayError('Failed', 'The payment session has expired. Start a new order to pay.', 401);

/**
 * Starts (or restarts) the checkout → `{ paymentUrl }`, or `{ result }` when the order turns out
 * to be settled already. Throws 'Unavailable' when the scheme will not open.
 */
export async function startCheckout(config, token, orderUrl, fetchImpl = fetch) {
  const { provider } = config;
  let initUrl;
  try {
    const payment = await readPayment(orderUrl, token, fetchImpl);
    const settled = resultForState(payment.state);
    // Paid or under review: never start a second attempt. A failed payment can still be retried.
    if (settled && settled.status !== 'Failed') return { result: settled };
    initUrl = checkoutLink(payment.links, provider);
    if (!initUrl) throw new GatewayError('Unavailable', `The order no longer offers ${provider.name}.`);
  } catch (e) {
    if (e.status === 'Unavailable') throw e;
    if (e.httpStatus === 401) throw expired();
    // Could not re-read the order: fall back to the link it was created with, as native does.
    initUrl = config.initUrl;
  }

  let json;
  try {
    ({ json } = await call(fetchImpl, initUrl, 'POST', { token, body: {} }));
  } catch (e) {
    if (e.httpStatus === 401) throw expired();
    throw new GatewayError('Unavailable', e.message, e.httpStatus);
  }
  const body = json || {};
  const paymentUrl = typeof body.paymentUrl === 'string' && body.paymentUrl;
  if (String(body.status || '').toLowerCase() !== 'initiated' || !paymentUrl) {
    throw new GatewayError('Unavailable', body.errorMessage || `${provider.name} did not accept the payment.`);
  }
  return { paymentUrl };
}

/** `host` of a URL, lower-cased (RN's URL polyfill has no `hostname`). */
export function hostOf(url) {
  const m = typeof url === 'string' && url.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^:/?#]+)/i);
  return m ? m[1].toLowerCase() : undefined;
}

const pathOf = (url) => (typeof url === 'string' ? url.split('?')[0].toLowerCase() : '');

/**
 * The payer backed out on the scheme's page: its own cancel page (`/kpg/paymentcancel.htm`,
 * `/payment/paymentcancel.htm`), or the gateway's `.../{scheme}/Error/accept` callback, which the
 * backend always records as a failure and so can never mean the payer paid.
 */
export function isPayerCancel(url, schemeHost, provider) {
  if (schemeHost && hostOf(url) === schemeHost && pathOf(url).includes('cancel')) return true;
  const path = pathOf(url);
  return path.includes(`/${provider.segment}/error/`) && path.endsWith('/accept');
}
