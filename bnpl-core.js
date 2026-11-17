/**
 * Buy now, pay later (Tabby, Tamara) — the gateway side of the flow, no UI and no React Native
 * imports.
 *
 * Mirrors the native SDKs' BNPL flow (Android `BnplActivity` + `BnplProvider`, iOS
 * `BnplViewController`). The two providers are one integration that differs only in the nouns in
 * `PROVIDERS`:
 *  1. Authorise with the order's `payment-authorization` link → access token (from Set-Cookie).
 *  2. POST `payment:{provider}` with three return URLs → the hosted checkout URL + the provider's
 *     reference for it.
 *  3. The payer approves the plan on the provider's page (WebView).
 *  4. The provider redirects to one of our return URLs; that redirect is intercepted, never loaded.
 *  5. POST the reference to `.../{provider}/accept`, then poll the order for the final state.
 */

import { GatewayError, call, firstPayment, href, originAndPath, queryParam, sessionLinks } from './gateway-core';

export { authorize, pollResult } from './gateway-core';

export const PROVIDERS = {
  tabby: { apmName: 'TABBY', segment: 'tabby', name: 'Tabby', idField: 'tabbyPaymentId' },
  // Tamara wants the checkout's order id, Tabby the payment id; swapping them fails every accept.
  tamara: { apmName: 'TAMARA', segment: 'tamara', name: 'Tamara', idField: 'tamaraOrderId' },
};

/** Marks our return URLs so success / cancel / failure can be told apart. */
export const RESULT_PARAM = 'ni_sdk_result';

/** True when the outlet offers this provider on the order. */
export function isBnplAvailable(order, providerKey) {
  return bnplConfig(order, providerKey) !== undefined;
}

/**
 * Everything needed to run a checkout, or `undefined` when the order does not offer the provider.
 *
 * The return URLs reuse the order's hosted paypage, as the native SDKs do: it is the only address
 * on the order the providers will redirect a browser to, and it is never actually loaded.
 */
export function bnplConfig(order, providerKey) {
  const provider = PROVIDERS[providerKey];
  if (!provider) return undefined;
  const apms = (order && order.paymentMethods && order.paymentMethods.apm) || [];
  if (!apms.some((a) => String(a).toUpperCase() === provider.apmName)) return undefined;

  const session = sessionLinks(order);
  const payment = firstPayment(order);
  const paymentLinks = (payment && payment._links) || {};
  const self = href(paymentLinks.self);
  const checkoutUrl =
    href(paymentLinks[`payment:${provider.segment}`]) || (self ? `${self.replace(/\/+$/, '')}/${provider.segment}` : undefined);
  if (!checkoutUrl || !session) return undefined;

  const base = session.payPage.split('#')[0];
  const sep = base.includes('?') ? '&' : '?';
  return {
    provider,
    authUrl: session.authUrl,
    authCode: session.authCode,
    orderUrl: session.orderUrl,
    checkoutUrl,
    acceptUrl: `${checkoutUrl}/accept`,
    successUrl: `${base}${sep}payment_method=${provider.segment}&${RESULT_PARAM}=success`,
    cancelUrl: `${base}${sep}${RESULT_PARAM}=cancel`,
    failureUrl: `${base}${sep}payment_method=${provider.segment}&${RESULT_PARAM}=failure`,
  };
}

/**
 * Which return URL a navigation is heading to: 'success' | 'cancel' | 'failure' | 'unknown', or
 * `undefined` if it is not a return at all.
 *
 * Matched on origin + path, not on the marker alone: the gateway pastes our return URLs unencoded
 * into the provider's checkout URL, so the marker also appears on the checkout page itself. Forms
 * that rebuild the query (Tabby's "back to store", the test checkouts) drop the marker, which comes
 * back as 'unknown'.
 */
export function returnLeg(url, config) {
  const target = originAndPath(url);
  if (!target) return undefined;
  const targets = [config.successUrl, config.cancelUrl, config.failureUrl].map(originAndPath);
  if (!targets.includes(target)) return undefined;
  const marker = queryParam(url, RESULT_PARAM);
  return marker === 'success' || marker === 'cancel' || marker === 'failure' ? marker : 'unknown';
}

/**
 * A `.../notify?outcome=cancel` step on the provider's page means the payer chose Cancel there. The
 * gateway's test checkouts then return with only `code`, so the return itself cannot tell.
 */
export function isProviderCancel(url) {
  const path = originAndPath(url);
  return Boolean(path && path.endsWith('/notify') && (queryParam(url, 'outcome') || '').toLowerCase() === 'cancel');
}

/** The provider's reference from a return URL, for when initiation did not return one. */
export function referenceFromUrl(url, config) {
  const names = [config.provider.idField, 'orderId', 'order_id', 'paymentId', 'payment_id', 'checkoutId'];
  for (const name of names) {
    const v = queryParam(url, name);
    if (v) return v;
  }
  return undefined;
}

/**
 * Starts the checkout → `{ webUrl, reference }`. Throws status 'Unavailable' when the provider will
 * not open one (basket too small or large, unsupported currency, shopper refused, …).
 */
export async function startCheckout(config, token, fetchImpl = fetch) {
  const { name, idField } = config.provider;
  let json;
  try {
    ({ json } = await call(fetchImpl, config.checkoutUrl, 'POST', {
      token,
      body: {
        type: 'INSTALLMENTS',
        successUrl: config.successUrl,
        cancelUrl: config.cancelUrl,
        failureUrl: config.failureUrl,
      },
    }));
  } catch (e) {
    // An expired session ends the payment; anything else ends only this payment option.
    if (e.httpStatus === 401) throw new GatewayError('Failed', 'The payment session has expired. Start a new order to pay.', 401);
    throw new GatewayError('Unavailable', e.message, e.httpStatus);
  }
  const body = json || {};
  const str = (k) => (typeof body[k] === 'string' && body[k]) || undefined;
  if (body.cancelled === true) throw new GatewayError('Aborted', `${name} checkout was cancelled.`);
  const webUrl = body.isError === true ? undefined : str('webUrl') || str('redirectUrl') || str('paymentUrl') || str('checkoutUrl');
  if (!webUrl) throw new GatewayError('Unavailable', str('errorMessage') || `${name} is not available for this order.`);
  // Provider-specific names win: an order id and a payment id are different things.
  return { webUrl, reference: str(idField) || str('orderId') || str('paymentId') };
}

/** Hands the provider's reference to the gateway. Returns the HTTP status (200 = accepted, -1 = no response). */
export async function accept(config, token, reference, fetchImpl = fetch) {
  try {
    await call(fetchImpl, config.acceptUrl, 'POST', { token, body: { [config.provider.idField]: reference } });
    return 200;
  } catch (e) {
    return e.httpStatus || -1;
  }
}
