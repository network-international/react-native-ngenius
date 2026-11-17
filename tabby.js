/**
 * "Pay with Tabby" button for react-native-ngenius.
 *
 *   import { TabbyButton } from '@network-international/react-native-ngenius/tabby';
 *
 *   <TabbyButton order={order} onResult={({ status, error }) => ...} />
 *
 * Kept out of the main entry point because it needs `react-native-webview`: merchants who don't
 * offer Tabby never import this file, so they don't need that dependency.
 *
 * Renders nothing when the order does not offer Tabby. `onResult` receives `{ status, state?, error? }`
 * with status 'Success' | 'PostAuthReview' | 'Failed' | 'Aborted' | 'Unavailable' (see bnpl-button.js).
 */

import React from 'react';
import { BnplButton } from './bnpl-button';
import { isBnplAvailable } from './bnpl-core';

const LOGO = { source: require('./assets/tabby.png'), width: 66, height: 26 };

export function TabbyButton(props) {
  return <BnplButton {...props} providerKey="tabby" logo={LOGO} testID="ngenius-tabby" />;
}

/** True when the outlet offers Tabby on this order (TABBY in `paymentMethods.apm`). */
export const isTabbyAvailable = (order) => isBnplAvailable(order, 'tabby');
