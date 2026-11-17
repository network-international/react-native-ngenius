// Type definitions for @network-international/react-native-ngenius/benefit.
// Requires `react-native-webview` in the app.

import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { NGeniusOrder } from './index';

export type BenefitStatus = 'Success' | 'PostAuthReview' | 'Failed' | 'Aborted' | 'Unavailable';

export interface BenefitResult {
  /**
   * - `Success`: paid.
   * - `PostAuthReview`: paid but under review; hold fulfilment until it clears.
   * - `Failed`: declined, or the outcome could not be confirmed; check the order.
   * - `Aborted`: the payer backed out or cancelled on Benefit; nothing charged, the order is still payable.
   * - `Unavailable`: Benefit would not open a checkout; offer another method.
   */
  status: BenefitStatus;
  /** The payment state read from the order, when there is one. */
  state?: string;
  error?: string;
}

export interface BenefitButtonProps {
  /** The order JSON from your backend, the same object passed to `initiateCardPayment`. */
  order: NGeniusOrder;
  onResult: (result: BenefitResult) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** "Pay with Benefit" button. Renders nothing unless the order is a BHD purchase that offers Benefit. */
export function BenefitButton(props: BenefitButtonProps): React.ReactElement | null;

/** True when the order is a BHD purchase and the outlet lists BENEFIT among its card schemes. */
export function isBenefitAvailable(order: NGeniusOrder): boolean;
