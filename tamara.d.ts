// Type definitions for @network-international/react-native-ngenius/tamara.
// Requires `react-native-webview` in the app.

import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { NGeniusOrder } from './index';

export type TamaraStatus = 'Success' | 'PostAuthReview' | 'Failed' | 'Aborted' | 'Unavailable';

export interface TamaraResult {
  /**
   * - `Success`: paid.
   * - `PostAuthReview`: paid but under review; hold fulfilment until it clears.
   * - `Failed`: declined, or the outcome could not be confirmed; check the order.
   * - `Aborted`: the payer backed out; nothing charged, the order is still payable.
   * - `Unavailable`: Tamara would not open a checkout (amount, currency, …); offer another method.
   */
  status: TamaraStatus;
  /** The payment state read from the order, when there is one. */
  state?: string;
  error?: string;
}

export interface TamaraButtonProps {
  /** The order JSON from your backend, the same object passed to `initiateCardPayment`. */
  order: NGeniusOrder;
  onResult: (result: TamaraResult) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** "Pay with Tamara" button. Renders nothing when the order does not offer Tamara. */
export function TamaraButton(props: TamaraButtonProps): React.ReactElement | null;

/** True when the outlet offers Tamara on this order (TAMARA in `paymentMethods.apm`). */
export function isTamaraAvailable(order: NGeniusOrder): boolean;
