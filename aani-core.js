/**
 * AANI (UAE instant payments) — the gateway side of the flow, no UI and no React Native imports.
 *
 * Mirrors the native SDKs (Android `AaniPayActivity` / `AaniPayViewModel`, iOS `AaniPay…`). Two ways
 * to pay, both settled by polling:
 *  - Request to Pay: POST the payer's alias (mobile number, Emirates ID, passport or email) to the
 *    payment's `payment:aani` link. AANI sends a request to the payer's banking app; the response
 *    carries a `cnp:aani-status` link to poll (and, when the bank provides one, a deep link into it).
 *  - QR: POST `{}` to `payment:aani-qr` → EMV QR data to show, then poll `…/status`, and DELETE the
 *    QR if the payer cancels or it expires.
 */

import { GatewayError, call, firstPayment, href, originOf, resultForState, sessionLinks } from './gateway-core';

export { authorize, resultForState } from './gateway-core';

/** How long a request or QR stays open, as on native (the countdown the payer sees). */
export const AANI_TIMEOUT_MS = 5 * 60 * 1000;

/** The aliases AANI accepts, with the native SDKs' validation. */
export const ALIAS_TYPES = [
  {
    key: 'MOBILE_NUMBER',
    label: 'Mobile number',
    placeholder: '501234567',
    keyboardType: 'number-pad',
    normalize: (v) => v.replace(/\D/g, ''),
    valid: (v) => /^\d{5,13}$/.test(v),
    body: (v) => ({ mobileNumber: { countryCode: '+971', number: v } }),
  },
  {
    key: 'EMIRATES_ID',
    label: 'Emirates ID',
    placeholder: '784-XXXX-XXXXXXX-X',
    keyboardType: 'number-pad',
    // Typed with or without dashes; sent as 784-XXXX-XXXXXXX-X.
    normalize: (v) => {
      const d = v.replace(/\D/g, '');
      return d.length === 15 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 14)}-${d.slice(14)}` : d;
    },
    valid: (v) => /^784-\d{4}-\d{7}-\d$/.test(v),
    body: (v) => ({ emiratesId: v }),
  },
  {
    key: 'PASSPORT_ID',
    label: 'Passport',
    placeholder: 'X12345678',
    keyboardType: 'default',
    normalize: (v) => v.trim().toUpperCase(),
    valid: (v) => /^[0-9CFGHJKLMNPRTVWXYZ]{9}$/.test(v),
    body: (v) => ({ passportId: v }),
  },
  {
    key: 'EMAIL',
    label: 'Email',
    placeholder: 'example@example.com',
    keyboardType: 'email-address',
    normalize: (v) => v.trim(),
    valid: (v) => /^[a-zA-Z][a-zA-Z0-9._]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v),
    body: (v) => ({ emailId: v }),
  },
];

export function isAaniAvailable(order) {
  return aaniConfig(order) !== undefined;
}

/** Everything needed to pay with AANI, or `undefined` when the order does not offer it. */
export function aaniConfig(order) {
  const apms = (order && order.paymentMethods && order.paymentMethods.apm) || [];
  if (!apms.some((a) => String(a).toUpperCase() === 'AANI')) return undefined;
  const payment = firstPayment(order);
  const links = (payment && payment._links) || {};
  const payUrl = href(links['payment:aani']);
  const session = sessionLinks(order);
  if (!payUrl || !session) return undefined;
  return {
    authUrl: session.authUrl,
    authCode: session.authCode,
    orderUrl: session.orderUrl,
    payPage: session.payPage,
    payUrl,
    qrUrl: href(links['payment:aani-qr']),
    amount: order.amount,
  };
}

/** "AED 500.00" from a gateway amount in minor units. */
export function formatAmount(amount) {
  if (!amount || typeof amount.value !== 'number') return '';
  const code = String(amount.currencyCode || '').toUpperCase();
  const digits = ['BHD', 'KWD', 'OMR', 'JOD', 'IQD', 'LYD', 'TND'].includes(code) ? 3 : 2;
  return `${code} ${(amount.value / 10 ** digits).toFixed(digits)}`;
}

/** The payer's public IP as the paypage sees it; AANI requires it. Empty if it cannot be read. */
export async function payerIp(config, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${originOf(config.payPage)}/api/requester-ip`, { credentials: 'omit' });
    const json = await res.json();
    return (json && typeof json.requesterIp === 'string' && json.requesterIp) || '';
  } catch (e) {
    return '';
  }
}

const expired = () => new GatewayError('Failed', 'The payment session has expired. Start a new order to pay.', 401);

/**
 * Sends a Request to Pay to the payer's alias → `{ statusUrl, deepLink? }`. A rejected alias throws
 * status 'Invalid' (the payer can correct it and try again).
 */
export async function requestToPay(config, token, aliasType, value, ip, fetchImpl = fetch) {
  const body = {
    aliasType: aliasType.key,
    ...aliasType.body(value),
    backLink: 'niannipay://open',
    source: 'MOBILE_APP',
    payerIp: ip,
  };
  let json;
  try {
    ({ json } = await call(fetchImpl, config.payUrl, 'POST', { token, body }));
  } catch (e) {
    if (e.httpStatus === 401) throw expired();
    if (e.httpStatus && e.httpStatus < 500) throw new GatewayError('Invalid', e.message, e.httpStatus);
    throw e;
  }
  const statusUrl = href(json && json._links && json._links['cnp:aani-status']);
  if (!statusUrl) throw new GatewayError('Failed', 'AANI did not accept the request.');
  const aani = (json && json.aani) || {};
  // The deep link into the payer's bank app. Native reads `deepLinkUrl`; the gateway also returns
  // the same `aani://` link in `emvQrData` for alias payments.
  const candidates = [aani.deepLinkUrl, aani.emvQrData];
  const deepLink = candidates.find((u) => typeof u === 'string' && /^[a-z][a-z0-9+.-]*:\/\//i.test(u) && !/^https?:/i.test(u));
  return { statusUrl, deepLink };
}

/** The payment's state from a status link, or `undefined` when it could not be read. */
export async function readState(url, token, fetchImpl = fetch) {
  try {
    const { json } = await call(fetchImpl, url, 'GET', { token });
    return String((json && json.state) || '').toUpperCase();
  } catch (e) {
    if (e.httpStatus === 401) throw expired();
    return undefined;
  }
}

/** Creates a QR → `{ qrData, statusUrl, cancelUrl }`. */
export async function createQr(config, token, fetchImpl = fetch) {
  let json;
  try {
    ({ json } = await call(fetchImpl, config.qrUrl, 'POST', { token, body: {} }));
  } catch (e) {
    if (e.httpStatus === 401) throw expired();
    throw new GatewayError('Failed', 'Could not generate the QR code. Try again.', e.httpStatus);
  }
  const aani = (json && json.aani) || {};
  if (!aani.emvQrData || !aani.qrCodeId || !aani.qrCodeTransactionId) {
    throw new GatewayError('Failed', 'Could not generate the QR code. Try again.');
  }
  const q = `qrCodeId=${encodeURIComponent(aani.qrCodeId)}&qrTransactionId=${encodeURIComponent(aani.qrCodeTransactionId)}`;
  return { qrData: aani.emvQrData, statusUrl: `${config.qrUrl}/status?${q}`, cancelUrl: `${config.qrUrl}?${q}` };
}

/** Withdraws a QR so it can no longer be paid. Best effort: a paid QR cannot be withdrawn. */
export async function cancelQr(qr, token, fetchImpl = fetch) {
  try {
    await call(fetchImpl, qr.cancelUrl, 'DELETE', { token });
  } catch (e) {
    // Already paid, expired or gone; the next status read decides.
  }
}

/** Maps a polled state to a final result, or `undefined` while the payer has not finished. */
export const finalResult = (state) => resultForState(state);
