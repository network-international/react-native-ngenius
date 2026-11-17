/**
 * "Pay with KNET" (Kuwait debit) button for react-native-ngenius.
 *
 *   import { KnetButton } from '@network-international/react-native-ngenius/knet';
 *
 *   <KnetButton order={order} onResult={({ status, error }) => ...} />
 *
 * Kept out of the main entry point because it needs `react-native-webview`.
 *
 * Renders nothing unless the order is in KWD and offers KNET. `onResult` receives
 * `{ status, state?, error? }` with status 'Success' | 'PostAuthReview' | 'Failed' | 'Aborted' |
 * 'Unavailable' (see hosted-button.js).
 */

import React from 'react';
import { HostedButton } from './hosted-button';
import { isHostedAvailable } from './hosted-core';

// KNET's badge is 115x83.
const LOGO = { source: require('./assets/knet.png'), width: 42, height: 30 };

export function KnetButton(props) {
  return <HostedButton {...props} providerKey="knet" logo={LOGO} testID="ngenius-knet" />;
}

/** True when the order is in KWD and carries a `payment:knet` link. */
export const isKnetAvailable = (order) => isHostedAvailable(order, 'knet');
