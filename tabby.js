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
 * Renders nothing when the order does not offer Tabby. `onResult` receives `{ status, error? }`:
 *  - 'Success'         paid (authorised / purchased / captured)
 *  - 'PostAuthReview'  paid but under review; hold fulfilment
 *  - 'Failed'          declined, or the outcome could not be confirmed; check the order
 *  - 'Aborted'         the payer backed out; nothing charged, the order is still payable
 *  - 'Unavailable'     Tabby would not open a checkout (amount, currency, …); offer another method
 */

import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  accept,
  authorize,
  isProviderCancel,
  pollResult,
  returnLeg,
  startCheckout,
  tabbyConfig,
} from './tabby-core';

export { isTabbyAvailable } from './tabby-core';

const TABBY_LOGO = require('./assets/tabby.png');

const RETRYABLE_ACCEPT = [401, 403, 408, 429];

export function TabbyButton({ order, onResult, disabled, style }) {
  const config = useMemo(() => tabbyConfig(order), [order]);
  const [phase, setPhase] = useState('idle'); // idle | starting | checkout | finishing
  const [webUrl, setWebUrl] = useState();
  const session = useRef({});

  if (!config) return null;

  const report = (result) => {
    const s = session.current;
    if (s.settled) return;
    s.settled = true;
    setPhase('idle');
    setWebUrl(undefined);
    if (onResult) onResult(result);
  };

  const reportError = (e) =>
    report({ status: (e && e.status) || 'Failed', error: (e && e.message) || String(e) });

  const start = async () => {
    session.current = {};
    setPhase('starting');
    try {
      const { token, orderUrl } = await authorize(config);
      const checkout = await startCheckout(config, token);
      Object.assign(session.current, { token, orderUrl, paymentId: checkout.tabbyPaymentId });
      setWebUrl(checkout.webUrl);
      setPhase('checkout');
    } catch (e) {
      reportError(e);
    }
  };

  const finish = async (leg, url) => {
    const s = session.current;
    if (s.returned) return;
    s.returned = true;
    setPhase('finishing');

    if (leg === 'cancel' || (leg === 'unknown' && s.providerCancelled)) {
      report({ status: 'Aborted' });
      return;
    }
    try {
      const id = s.paymentId || queryId(url);
      let giveUpEarly = false;
      if (id) {
        const status = await accept(config, s.token, id);
        // A 4xx means there is nothing to finalise (e.g. Tabby's "back to store"); read the order
        // once in case it settled rather than making the payer wait out the full poll.
        giveUpEarly = leg !== 'success' && status >= 400 && status < 500 && !RETRYABLE_ACCEPT.includes(status);
      }
      const result = await pollResult(s.orderUrl, s.token, giveUpEarly);
      if (result) report(result);
      else if (leg === 'unknown') report({ status: 'Aborted' });
      else report({ status: 'Failed', error: 'Payment was not completed on Tabby.' });
    } catch (e) {
      reportError(e);
    }
  };

  /** Returns false to stop a navigation (our return URLs are never loaded). */
  const onNavigate = (url) => {
    if (isProviderCancel(url)) session.current.providerCancelled = true;
    const leg = returnLeg(url, config);
    if (!leg) return true;
    finish(leg, url);
    return false;
  };

  const onClose = () => {
    // After a return the order decides; before it, nothing was charged.
    if (session.current.returned) return;
    report({ status: 'Aborted' });
  };

  const busy = phase !== 'idle';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pay with Tabby"
        testID="ngenius-tabby-button"
        disabled={disabled || busy}
        onPress={start}
        style={({ pressed }) => [styles.button, (disabled || busy) && styles.dimmed, pressed && styles.pressed, style]}
      >
        {phase === 'starting' ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            <Text style={styles.label}>Pay with</Text>
            <Image source={TABBY_LOGO} style={styles.logo} resizeMode="contain" />
          </>
        )}
      </Pressable>

      <Modal
        visible={phase === 'checkout' || phase === 'finishing'}
        animationType="slide"
        onRequestClose={onClose}
      >
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" testID="ngenius-tabby-close">
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          {webUrl ? (
            <WebView
              source={{ uri: webUrl }}
              onShouldStartLoadWithRequest={(r) => onNavigate(r.url)}
              onNavigationStateChange={(n) => {
                onNavigate(n.url);
              }}
              onError={() => {
                if (!session.current.returned) report({ status: 'Unavailable', error: 'Failed to load the Tabby page.' });
              }}
              javaScriptEnabled
              domStorageEnabled
              incognito
              setSupportMultipleWindows={false}
              startInLoadingState
            />
          ) : null}
          {phase === 'finishing' ? (
            <View style={styles.cover}>
              <ActivityIndicator size="large" />
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

function queryId(url) {
  const m = typeof url === 'string' && url.match(/[?&](?:tabbyPaymentId|payment_id|paymentId)=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  label: { fontSize: 16, fontWeight: '600', color: '#000', marginRight: 8 },
  logo: { width: 66, height: 26 },
  sheet: { flex: 1, backgroundColor: '#fff' },
  header: { height: 44, justifyContent: 'center', paddingHorizontal: 16 },
  close: { fontSize: 20, color: '#000' },
  cover: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
