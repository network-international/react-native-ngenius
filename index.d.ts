// Type definitions for @network-international/react-native-ngenius.

/**
 * The order JSON returned by the N-Genius "create order" API, passed through
 * unchanged. Create it on your backend and hand it to the app.
 */
export interface NGeniusOrder {
  reference?: string;
  amount?: { currencyCode: string; value: number; formattedValue?: string };
  _links?: Record<string, unknown>;
  _embedded?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Status reported by the native SDK. Only `"Success"` means the payment succeeded. */
export type PaymentStatus =
  | 'Success'
  | 'Failed'
  | 'Aborted'
  | 'PaymentFailed'
  | 'Error'
  | 'Not Supported'
  | (string & {});

/** Resolved value of every `initiate…` call. */
export interface PaymentSuccess {
  status: 'Success';
}

/**
 * Rejection value of every `initiate…` call (anything other than `"Success"`).
 * `error` is set by the wallet calls and by argument validation, not by the card page.
 */
export interface PaymentFailure {
  status: PaymentStatus;
  error?: string;
}

export interface ApplePayConfig {
  /** Apple Pay merchant ID, e.g. `merchant.com.example`. Must be in the app's entitlements. */
  merchantIdentifier: string;
  /** ISO 3166-1 alpha-2 country code of the merchant, e.g. `"AE"` or `"SA"`. */
  countryCode: string;
  /** Label shown on the Apple Pay sheet. Defaults to `"Total"`. */
  merchantName?: string;
}

export interface GooglePayConfig {
  merchantName: string;
  gateway: string;
  gatewayMerchantId: string;
  environment: 'TEST' | 'PRODUCTION';
  /** Google Pay merchant ID (required in PRODUCTION). */
  merchantId?: string;
  merchantOrigin?: string;
}

export interface GooglePaySuccess extends PaymentSuccess {
  /**
   * The Google Pay payment token. Google Pay does not complete the N-Genius payment:
   * submit this token to the order's `payment:google_pay` link yourself.
   */
  token: string;
}

export interface SDKConfig {
  /** Android: show the order amount on the payment page. */
  shouldShowOrderAmount?: boolean;
  /** SDK language on iOS and Android: `"en"`, `"ar"` or `"fr"`. */
  language?: string;
}

export interface DeviceInfo {
  platform: string;
  manufacturer: string;
  model: string;
  osVersion: number;
}

export const SDK_VERSION: string;

/** Device details used for the SDK's User-Agent. Full details on Android; iOS returns a fallback. */
export function getDeviceInfo(): Promise<DeviceInfo>;

/**
 * Opens the native card payment page (card entry and 3-D Secure).
 * Resolves on `"Success"`; rejects with `{ status }` (`"Failed"`, `"Aborted"`, …) otherwise.
 */
export function initiateCardPayment(order: NGeniusOrder): Promise<PaymentSuccess>;

/** iOS only. Presents the Apple Pay sheet and completes the payment. */
export function initiateApplePay(order: NGeniusOrder, applePayConfig: ApplePayConfig): Promise<PaymentSuccess>;

/** Android only. Presents Samsung Pay and completes the payment. */
export function initiateSamsungPay(
  order: NGeniusOrder,
  merchantName: string,
  serviceId: string,
): Promise<PaymentSuccess>;

/** Android only. Returns a Google Pay token; see {@link GooglePaySuccess.token}. */
export function initiateGooglePay(order: NGeniusOrder, googlePayConfig: GooglePayConfig): Promise<GooglePaySuccess>;

/** iOS only; rejects on Android. */
export function isApplePaySupported(): Promise<boolean>;

/** Android only; rejects on iOS. */
export function isSamsungPaySupported(serviceId: string): Promise<boolean>;

/** Android only; rejects on iOS. */
export function isGooglePaySupported(googlePayConfig?: Partial<GooglePayConfig>): Promise<boolean>;

export function configureSDK(config: SDKConfig): void;

/**
 * Runs 3-D Secure 2 for a payment response obtained outside the SDK (e.g. a saved-card
 * payment made from your backend). Resolves on `"Success"`.
 */
export function executeThreeDSTwo(paymentResponse: Record<string, unknown>): Promise<PaymentSuccess>;
