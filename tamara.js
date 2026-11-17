/**
 * "Pay with Tamara" button for react-native-ngenius.
 *
 *   import { TamaraButton } from '@network-international/react-native-ngenius/tamara';
 *
 *   <TamaraButton order={order} onResult={({ status, error }) => ...} />
 *
 * Kept out of the main entry point because it needs `react-native-webview`: merchants who don't
 * offer Tamara never import this file, so they don't need that dependency.
 *
 * Renders nothing when the order does not offer Tamara. `onResult` receives `{ status, state?, error? }`
 * with status 'Success' | 'PostAuthReview' | 'Failed' | 'Aborted' | 'Unavailable' (see bnpl-button.js).
 */

import React from 'react';
import { BnplButton } from './bnpl-button';
import { isBnplAvailable } from './bnpl-core';

const LOGO = { source: require('./assets/tamara.png'), width: 81, height: 16 };

export function TamaraButton(props) {
  return <BnplButton {...props} providerKey="tamara" logo={LOGO} testID="ngenius-tamara" />;
}

/** True when the outlet offers Tamara on this order (TAMARA in `paymentMethods.apm`). */
export const isTamaraAvailable = (order) => isBnplAvailable(order, 'tamara');
