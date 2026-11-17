// Type definitions for @network-international/react-native-ngenius/qpay.
// Requires `react-native-webview` in the app.

import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { NGeniusOrder } from './index';

export type QPayStatus = 'Success' | 'PostAuthReview' | 'Failed' | 'Aborted' | 'Unavailable';

export interface QPayResult {
  /**
   * - `Success`: paid.
   * - `PostAuthReview`: paid but under review; hold fulfilment until it clears.
   * - `Failed`: declined, or the outcome could not be confirmed; check the order.
   * - `Aborted`: the payer backed out; nothing charged, the order is still payable.
   * - `Unavailable`: QPay would not open a checkout; offer another method.
   */
  status: QPayStatus;
  /** The payment state read from the order, when there is one. */
  state?: string;
  error?: string;
}

export interface QPayButtonProps {
  /** The order JSON from your backend, the same object passed to `initiateCardPayment`. */
  order: NGeniusOrder;
  onResult: (result: QPayResult) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** "Pay with NAPS" button. Renders nothing unless the order is in QAR and offers QPay. */
export function QPayButton(props: QPayButtonProps): React.ReactElement | null;

/** True when the order is in QAR and carries a `payment:qpay` link. */
export function isQPayAvailable(order: NGeniusOrder): boolean;
