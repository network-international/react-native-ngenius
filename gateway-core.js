/**
 * Gateway calls shared by the WebView payment buttons (Tabby, Tamara, QPay, KNET). No UI and no React Native
 * imports.
 */

const MEDIA_TYPE = 'application/vnd.ni-payment.v2+json';

const SUCCESS_STATES = ['AUTHORISED', 'PURCHASED', 'CAPTURED', 'VERIFIED'];
const FAILURE_STATES = ['FAILED', 'DECLINED', 'CANCELLED', 'REVERSED'];
const REVIEW_STATE = 'POST_AUTH_REVIEW';

/** `status` is the result status the button reports: 'Failed', 'Unavailable' or 'Aborted'. */
export class GatewayError extends Error {
  constructor(status, message, httpStatus) {
    super(message);
    this.status = status;
    this.httpStatus = httpStatus;
  }
}

export const href = (link) => (link && typeof link.href === 'string' && link.href) || undefined;
export const firstPayment = (order) =>
  order && order._embedded && order._embedded.payment && order._embedded.payment[0];

// --- URL helpers (RN's URL polyfill has no pathname / searchParams) -------------------------

/** `scheme://host[:port]/path`, without query, fragment or trailing slash. */
export function originAndPath(url) {
  const m = typeof url === 'string' && url.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)/i);
  if (!m) return undefined;
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${m[3].replace(/\/+$/, '')}`;
}

/** `scheme://host[:port]`. */
export function originOf(url) {
  const m = typeof url === 'string' && url.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i);
  return m ? `${m[1].toLowerCase()}://${m[2].toLowerCase()}` : undefined;
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

// --- API -----------------------------------------------------------------------------------

export async function call(fetchImpl, url, method, { token, body, form } = {}) {
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
    throw new GatewayError('Failed', 'Network error, check the connection and try again.');
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
    throw new GatewayError('Failed', message, res.status);
  }
  return { json, res };
}

/** The order's sign-in link, one-time code and own URL, or `undefined` if any is missing. */
export function sessionLinks(order) {
  const links = (order && order._links) || {};
  const authUrl = href(links['payment-authorization']);
  const payPage = href(links.payment);
  if (!authUrl || !payPage) return undefined;
  return { authUrl, authCode: queryParam(payPage, 'code'), orderUrl: href(links.self), payPage };
}

/** Tokens already obtained, by order code: the code works once, so a second attempt reuses the token. */
const sessions = new Map();

/**
 * Exchanges the order's one-time code for an access token, exactly as the native SDKs do. The
 * token comes back as an `access-token` cookie; RN exposes Set-Cookie on both platforms.
 *
 * The code can only be exchanged once, so the result is kept for the order: pressing a button
 * again after backing out (or a second payment button on the same order) reuses the token rather
 * than failing with 403. A token that has since expired surfaces as a 401 on the next call.
 */
export function authorize(config, fetchImpl = fetch) {
  const key = `${config.authUrl}|${config.authCode}`;
  if (!sessions.has(key)) {
    const pending = exchangeCode(config, fetchImpl);
    sessions.set(key, pending);
    pending.catch(() => sessions.delete(key));
  }
  return sessions.get(key);
}

async function exchangeCode(config, fetchImpl) {
  if (!config.authCode) throw new GatewayError('Failed', 'The order has no payment code.');
  const { json, res } = await call(fetchImpl, config.authUrl, 'POST', {
    form: `code=${encodeURIComponent(config.authCode)}`,
  });
  const cookies = (res.headers && res.headers.get && res.headers.get('set-cookie')) || '';
  const m = cookies.match(/(?:^|[\s,;])access-token=([^;,\s]+)/);
  if (!m) throw new GatewayError('Failed', 'The payment session could not be authorised.');
  const orderUrl = href(json && json._links && json._links['cnp:order']) || config.orderUrl;
  if (!orderUrl) throw new GatewayError('Failed', 'The order link is missing.');
  return { token: m[1], orderUrl };
}

/** The order's first payment, freshly read: `{ state, links }`. Throws a GatewayError on failure. */
export async function readPayment(orderUrl, token, fetchImpl = fetch) {
  const { json } = await call(fetchImpl, orderUrl, 'GET', { token });
  const payment = firstPayment(json) || {};
  return { state: String(payment.state || '').toUpperCase(), links: payment._links || {} };
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
 * stops after the first non-final read and resolves `undefined`.
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
    error: 'The payment did not reach a final state in time; confirm it from the order.',
  };
}
