// Type definitions for @network-international/react-native-ngenius/tabby.
// Requires `react-native-webview` in the app.

import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { NGeniusOrder } from './index';

export type TabbyStatus = 'Success' | 'PostAuthReview' | 'Failed' | 'Aborted' | 'Unavailable';

export interface TabbyResult {
  /**
   * - `Success`: paid.
   * - `PostAuthReview`: paid but under review; hold fulfilment until it clears.
   * - `Failed`: declined, or the outcome could not be confirmed; check the order.
   * - `Aborted`: the payer backed out; nothing charged, the order is still payable.
   * - `Unavailable`: Tabby would not open a checkout (amount, currency, …); offer another method.
   */
  status: TabbyStatus;
  /** The payment state read from the order, when there is one. */
  state?: string;
  error?: string;
}

export interface TabbyButtonProps {
  /** The order JSON from your backend, the same object passed to `initiateCardPayment`. */
  order: NGeniusOrder;
  onResult: (result: TabbyResult) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** "Pay with Tabby" button. Renders nothing when the order does not offer Tabby. */
export function TabbyButton(props: TabbyButtonProps): React.ReactElement | null;

/** True when the outlet offers Tabby on this order (TABBY in `paymentMethods.apm`). */
export function isTabbyAvailable(order: NGeniusOrder): boolean;
