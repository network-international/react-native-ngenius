// Type definitions for @network-international/react-native-ngenius/aani.
// No extra dependencies (no WebView).

import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { NGeniusOrder } from './index';

export type AaniStatus = 'Success' | 'PostAuthReview' | 'Failed' | 'Aborted' | 'Unavailable';

export interface AaniResult {
  /**
   * - `Success`: paid.
   * - `PostAuthReview`: paid but under review; hold fulfilment until it clears.
   * - `Failed`: declined, or not approved in time; check the order.
   * - `Aborted`: the payer closed AANI before sending a request, or cancelled the QR code.
   * - `Unavailable`: AANI could not be offered; offer another method.
   */
  status: AaniStatus;
  /** The payment state read from the order, when there is one. */
  state?: string;
  error?: string;
}

export interface AaniButtonProps {
  /** The order JSON from your backend, the same object passed to `initiateCardPayment`. */
  order: NGeniusOrder;
  onResult: (result: AaniResult) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** "Pay with AANI" button. Renders nothing unless the order offers AANI. */
export function AaniButton(props: AaniButtonProps): React.ReactElement | null;

/** True when AANI is in `paymentMethods.apm` and the payment carries a `payment:aani` link. */
export function isAaniAvailable(order: NGeniusOrder): boolean;
