/**
 * "Pay with Benefit" (Bahrain debit) button for react-native-ngenius.
 *
 *   import { BenefitButton } from '@network-international/react-native-ngenius/benefit';
 *
 *   <BenefitButton order={order} onResult={({ status, error }) => ...} />
 *
 * Kept out of the main entry point because it needs `react-native-webview`.
 *
 * Renders nothing unless the order is a BHD purchase on an outlet with BENEFIT among its card
 * schemes. `onResult` receives `{ status, state?, error? }` with status 'Success' |
 * 'PostAuthReview' | 'Failed' | 'Aborted' | 'Unavailable' (see hosted-button.js).
 */

import React from 'react';
import { HostedButton } from './hosted-button';
import { isHostedAvailable } from './hosted-core';

// The Benefit mark is 28x40.
const LOGO = { source: require('./assets/benefit.png'), width: 21, height: 30 };

export function BenefitButton(props) {
  return <HostedButton {...props} providerKey="benefit" logo={LOGO} testID="ngenius-benefit" />;
}

/** True when the order is a BHD purchase and the outlet lists BENEFIT among its card schemes. */
export const isBenefitAvailable = (order) => isHostedAvailable(order, 'benefit');
