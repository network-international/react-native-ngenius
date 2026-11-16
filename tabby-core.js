/**
 * Tabby (buy now, pay later) — the gateway side of the flow, no UI and no React Native imports.
 *
 * Mirrors the native SDKs' BNPL flow (Android `BnplActivity`, iOS `BnplViewController`):
 *  1. Authorise with the order's `payment-authorization` link → access token (from Set-Cookie).
 *  2. POST `payment:tabby` with three return URLs → Tabby's hosted checkout URL + `tabbyPaymentId`.
 *  3. The payer approves the plan on Tabby's page (WebView).
 *  4. Tabby redirects to one of our return URLs; that redirect is intercepted, never loaded.
 *  5. POST `{ tabbyPaymentId }` to `.../tabby/accept`, then poll the order for the final state.
 */

const MEDIA_TYPE = 'application/vnd.ni-payment.v2+json';

/** Marks our return URLs so success / cancel / failure can be told apart. */
export const RESULT_PARAM = 'ni_sdk_result';

const SUCCESS_STATES = ['AUTHORISED', 'PURCHASED', 'CAPTURED', 'VERIFIED'];
const FAILURE_STATES = ['FAILED', 'DECLINED', 'CANCELLED', 'REVERSED'];
const REVIEW_STATE = 'POST_AUTH_REVIEW';

export class TabbyError extends Error {
  constructor(status, message, httpStatus) {
    super(message);
    this.status = status;
    this.httpStatus = httpStatus;
  }
}

const href = (link) => (link && typeof link.href === 'string' && link.href) || undefined;
const firstPayment = (order) => order && order._embedded && order._embedded.payment && order._embedded.payment[0];

/** True when the outlet offers Tabby on this order. */
export function isTabbyAvailable(order) {
  return tabbyConfig(order) !== undefined;
}

/**
 * Everything needed to run a Tabby checkout, or `undefined` when the order does not offer it.
 *
 * The return URLs reuse the order's hosted paypage, as the native SDKs do: it is the only address
 * on the order Tabby will redirect a browser to, and it is never actually loaded.
 */
export function tabbyConfig(order) {
  const apms = (order && order.paymentMethods && order.paymentMethods.apm) || [];
  if (!apms.some((a) => String(a).toUpperCase() === 'TABBY')) return undefined;

  const links = (order && order._links) || {};
  const payment = firstPayment(order);
  const paymentLinks = (payment && payment._links) || {};
  const self = href(paymentLinks.self);
  const checkoutUrl = href(paymentLinks['payment:tabby']) || (self ? `${self.replace(/\/+$/, '')}/tabby` : undefined);
  const authUrl = href(links['payment-authorization']);
  const payPage = href(links.payment);
  if (!checkoutUrl || !authUrl || !payPage) return undefined;

  const base = payPage.split('#')[0];
  const sep = base.includes('?') ? '&' : '?';
  return {
    authUrl,
    authCode: queryParam(payPage, 'code'),
    orderUrl: href(links.self),
    checkoutUrl,
    acceptUrl: `${checkoutUrl}/accept`,
    successUrl: `${base}${sep}payment_method=tabby&${RESULT_PARAM}=success`,
    cancelUrl: `${base}${sep}${RESULT_PARAM}=cancel`,
    failureUrl: `${base}${sep}payment_method=tabby&${RESULT_PARAM}=failure`,
  };
}

// --- URL helpers (RN's URL polyfill has no pathname / searchParams) -------------------------

/** `scheme://host[:port]/path`, without query, fragment or trailing slash. */
export function originAndPath(url) {
  const m = typeof url === 'string' && url.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)/i);
  if (!m) return undefined;
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${m[3].replace(/\/+$/, '')}`;
}

export function queryParam(url, name) {
  if (typeof url !== 'string') return undefined;
  const query = url.split('#')[0].split('?').slice(1).join('?');
  for (const pair of query.split('&')) {
    const i = pair.indexOf('=');
    const key = decode(i < 0 ? pair : pair.slice(0, i));
    if (key === name) return decode(i < 0 ? '' : pair.slice(i + 1).replace(/\+/g, ' ')) || undefined;
  }
  return undefined;
}

function decode(s) {
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

/**
 * Which return URL a navigation is heading to: 'success' | 'cancel' | 'failure' | 'unknown', or
 * `undefined` if it is not a return at all.
 *
 * Matched on origin + path, not on the marker alone: the gateway pastes our return URLs unencoded
 * into Tabby's checkout URL, so the marker also appears on the checkout page itself. Tabby's own
 * "back to store" form drops the marker, which comes back as 'unknown'.
 */
export function returnLeg(url, config) {
  const target = originAndPath(url);
  if (!target) return undefined;
  const targets = [config.successUrl, config.cancelUrl, config.failureUrl].map(originAndPath);
  if (!targets.includes(target)) return undefined;
  const marker = queryParam(url, RESULT_PARAM);
  return marker === 'success' || marker === 'cancel' || marker === 'failure' ? marker : 'unknown';
}

/** A `.../notify?outcome=cancel` step on the provider's page means the payer chose Cancel there. */
export function isProviderCancel(url) {
  const path = originAndPath(url);
  return Boolean(path && path.endsWith('/notify') && (queryParam(url, 'outcome') || '').toLowerCase() === 'cancel');
}

// --- API -----------------------------------------------------------------------------------

async function call(fetchImpl, url, method, { token, body, form } = {}) {
  const headers = { Accept: MEDIA_TYPE };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  else if (body !== undefined) headers['Content-Type'] = MEDIA_TYPE;
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
      credentials: 'omit',
    });
  } catch (e) {
    throw new TabbyError('Failed', 'Network error, check the connection and try again.');
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch (e) {
    json = undefined;
  }
  if (res.status < 200 || res.status >= 300) {
    const message = (json && (json.message || json.errorMessage)) || `N-Genius returned HTTP ${res.status}.`;
    throw new TabbyError('Failed', message, res.status);
  }
  return { json, res };
}

/**
 * Exchanges the order's one-time code for an access token, exactly as the native SDKs do. The
 * token comes back as an `access-token` cookie; RN exposes Set-Cookie on both platforms.
 */
export async function authorize(config, fetchImpl = fetch) {
  if (!config.authCode) throw new TabbyError('Failed', 'The order has no payment code.');
  const { json, res } = await call(fetchImpl, config.authUrl, 'POST', {
    form: `code=${encodeURIComponent(config.authCode)}`,
  });
  const cookies = (res.headers && res.headers.get && res.headers.get('set-cookie')) || '';
  const m = cookies.match(/(?:^|[\s,;])access-token=([^;,\s]+)/);
  if (!m) throw new TabbyError('Failed', 'The payment session could not be authorised.');
  const orderUrl = href(json && json._links && json._links['cnp:order']) || config.orderUrl;
  if (!orderUrl) throw new TabbyError('Failed', 'The order link is missing.');
  return { token: m[1], orderUrl };
}

/**
 * Starts the checkout → `{ webUrl, tabbyPaymentId }`. Throws status 'Unavailable' when Tabby will
 * not open one (basket too small or large, unsupported currency, shopper refused, …).
 */
export async function startCheckout(config, token, fetchImpl = fetch) {
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
    // An expired session ends the payment; anything else ends only the Tabby option.
    if (e.httpStatus === 401) throw new TabbyError('Failed', 'The payment session has expired. Start a new order to pay.', 401);
    throw new TabbyError('Unavailable', e.message, e.httpStatus);
  }
  const body = json || {};
  const str = (k) => (typeof body[k] === 'string' && body[k]) || undefined;
  if (body.cancelled === true) throw new TabbyError('Aborted', 'Tabby checkout was cancelled.');
  const webUrl = body.isError === true ? undefined : str('webUrl') || str('redirectUrl') || str('paymentUrl') || str('checkoutUrl');
  if (!webUrl) throw new TabbyError('Unavailable', str('errorMessage') || 'Tabby is not available for this order.');
  return { webUrl, tabbyPaymentId: str('tabbyPaymentId') || str('paymentId') };
}

/** Hands Tabby's reference to the gateway. Returns the HTTP status (200 = accepted, -1 = no response). */
export async function accept(config, token, tabbyPaymentId, fetchImpl = fetch) {
  try {
    await call(fetchImpl, config.acceptUrl, 'POST', { token, body: { tabbyPaymentId } });
    return 200;
  } catch (e) {
    return e.httpStatus || -1;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Maps a payment state to a result, or `undefined` while it is still in flight. */
export function resultForState(state) {
  const s = String(state || '').toUpperCase();
  if (SUCCESS_STATES.includes(s)) return { status: 'Success', state: s };
  if (s === REVIEW_STATE) return { status: 'PostAuthReview', state: s };
  if (FAILURE_STATES.includes(s)) return { status: 'Failed', state: s, error: `Payment ${s.toLowerCase()}` };
  return undefined;
}

/**
 * Polls the order until the payment is final (~51s, as the native SDKs do). With `giveUpEarly` it
 * stops after the first non-final read and resolves `undefined` — used when the gateway rejected
 * the accept, so the order will not move.
 */
export async function pollResult(orderUrl, token, giveUpEarly = false, fetchImpl = fetch, wait = sleep) {
  const delays = [0, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 3000, 3000, 3000];
  let lastState;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await wait(delays[i]);
    try {
      const { json } = await call(fetchImpl, orderUrl, 'GET', { token });
      const payment = firstPayment(json);
      lastState = (payment && payment.state) || lastState;
      const result = resultForState(payment && payment.state);
      if (result) return result;
    } catch (e) {
      // A read that failed says nothing about the payment; keep asking.
    }
    if (giveUpEarly && i === 0) return undefined;
  }
  return {
    status: 'Failed',
    state: lastState,
    error: 'The Tabby payment did not reach a final state in time; confirm it from the order.',
  };
}
