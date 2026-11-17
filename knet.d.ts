// Type definitions for @network-international/react-native-ngenius/knet.
// Requires `react-native-webview` in the app.

import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { NGeniusOrder } from './index';

export type KnetStatus = 'Success' | 'PostAuthReview' | 'Failed' | 'Aborted' | 'Unavailable';

export interface KnetResult {
  /**
   * - `Success`: paid.
   * - `PostAuthReview`: paid but under review; hold fulfilment until it clears.
   * - `Failed`: declined, or the outcome could not be confirmed; check the order.
   * - `Aborted`: the payer backed out; nothing charged, the order is still payable.
   * - `Unavailable`: KNET would not open a checkout; offer another method.
   */
  status: KnetStatus;
  /** The payment state read from the order, when there is one. */
  state?: string;
  error?: string;
}

export interface KnetButtonProps {
  /** The order JSON from your backend, the same object passed to `initiateCardPayment`. */
  order: NGeniusOrder;
  onResult: (result: KnetResult) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** "Pay with KNET" button. Renders nothing unless the order is in KWD and offers KNET. */
export function KnetButton(props: KnetButtonProps): React.ReactElement | null;

/** True when the order is in KWD and carries a `payment:knet` link. */
export function isKnetAvailable(order: NGeniusOrder): boolean;
