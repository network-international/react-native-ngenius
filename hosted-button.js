/**
 * The button and checkout sheet shared by `KnetButton` and `BenefitButton`. Not a public entry
 * point: import `./knet` or `./benefit`.
 *
 * Renders nothing when the order does not offer the scheme. `onResult` receives
 * `{ status, state?, error? }`:
 *  - 'Success'         paid
 *  - 'PostAuthReview'  paid but under review; hold fulfilment
 *  - 'Failed'          declined, or the outcome could not be confirmed; check the order
 *  - 'Aborted'         the payer backed out or cancelled on the scheme's page; the order is still payable
 *  - 'Unavailable'     the scheme would not open a checkout; offer another method
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  authorize,
  hostOf,
  hostedConfig,
  isPayerCancel,
  pollResult,
  readPayment,
  resultForState,
  startCheckout,
} from './hosted-core';

/** A page must sit still this long before it is shown, so redirect hops stay hidden. */
const REVEAL_DELAY_MS = 450;

/** States in which nothing has been recorded against the payment yet. */
const UNTOUCHED_STATES = ['', 'STARTED'];

/** `logo` is `{ source, width, height }`; `testID` prefixes the button and close IDs. */
export function HostedButton({ providerKey, logo, testID, order, onResult, disabled, style }) {
  const config = useMemo(() => hostedConfig(order, providerKey), [order, providerKey]);
  const [phase, setPhase] = useState('idle'); // idle | starting | checkout | finishing
  const [paymentUrl, setPaymentUrl] = useState();
  const [covered, setCovered] = useState(true);
  const [notice, setNotice] = useState();
  const session = useRef({});
  const webView = useRef(null);

  useEffect(() => () => clearTimeout(session.current.revealTimer), []);

  if (!config) return null;
  const { provider } = config;

  const reveal = () => {
    const s = session.current;
    clearTimeout(s.revealTimer);
    s.revealTimer = setTimeout(() => setCovered(false), REVEAL_DELAY_MS);
  };

  const report = (result) => {
    const s = session.current;
    if (s.settled) return;
    s.settled = true;
    clearTimeout(s.revealTimer);
    setPhase('idle');
    setPaymentUrl(undefined);
    setNotice(undefined);
    if (onResult) onResult(result);
  };

  const reportError = (e) =>
    report({ status: (e && e.status) || 'Failed', error: (e && e.message) || String(e) });

  const start = async () => {
    session.current = {};
    setNotice(undefined);
    setPhase('starting');
    try {
      const { token, orderUrl } = await authorize(config);
      const checkout = await startCheckout(config, token, orderUrl);
      if (checkout.result) {
        report(checkout.result);
        return;
      }
      Object.assign(session.current, {
        token,
        orderUrl,
        schemeHost: hostOf(checkout.paymentUrl),
        gatewayHost: hostOf(orderUrl),
      });
      setCovered(true);
      setPaymentUrl(checkout.paymentUrl);
      setPhase('checkout');
    } catch (e) {
      reportError(e);
    }
  };

  /** Once the payer is done on the scheme's page: a cancel ends here, anything else is read off the order. */
  const finish = async () => {
    const s = session.current;
    if (s.finishing || s.settled) return;
    s.finishing = true;
    setPhase('finishing');
    if (s.payerCancelled) {
      report({ status: 'Aborted' });
      return;
    }
    try {
      report(await pollResult(s.orderUrl, s.token));
    } catch (e) {
      reportError(e);
    }
  };

  /**
   * Tracks where the WebView is going. Returns false to stop a navigation: the paypage hop after
   * the scheme's result is a dead end inside the SDK. Navigations to the gateway are never
   * stopped — its callback is what records the result.
   */
  const onNavigate = (url) => {
    const s = session.current;
    const host = hostOf(url);
    if (isPayerCancel(url, s.schemeHost, provider)) s.payerCancelled = true;
    if (host === s.schemeHost) {
      s.reachedScheme = true;
      return true;
    }
    if (host === s.gatewayHost) {
      if (s.reachedScheme) s.returned = true;
      return true;
    }
    if (s.reachedScheme || s.returned) {
      s.returned = true;
      if (webView.current) webView.current.stopLoading();
      finish();
      return false;
    }
    return true;
  };

  const onLoadStart = ({ nativeEvent }) => {
    clearTimeout(session.current.revealTimer);
    setCovered(true);
    // Android reports form POSTs and server redirects only here, not to onShouldStartLoadWithRequest.
    onNavigate(nativeEvent.url);
  };

  const onLoadEnd = () => {
    const s = session.current;
    // The schemes' cancel pages never redirect back; once one has loaded the cancel is recorded,
    // so the payer is returned straight away.
    if (s.payerCancelled || s.returned) {
      finish();
      return;
    }
    reveal();
  };

  /**
   * Backing out. On the scheme's page an attempt may be in flight, so the order is read once:
   * paid ends the payment, untouched or failed is Aborted, and PENDING is Aborted for KNET but
   * holds the payer on Benefit's page.
   */
  const onClose = async () => {
    const s = session.current;
    if (s.finishing || s.verifying || s.settled) return;
    if (s.returned) {
      finish();
      return;
    }
    if (s.payerCancelled || !s.reachedScheme) {
      report({ status: 'Aborted' });
      return;
    }
    s.verifying = true;
    setCovered(true);
    let payment;
    try {
      payment = await readPayment(s.orderUrl, s.token);
    } catch (e) {
      // Could not read the order: stay on the page rather than abandon a payment in flight.
      s.verifying = false;
      reveal();
      return;
    }
    s.verifying = false;
    const result = resultForState(payment.state);
    if (result && result.status !== 'Failed') {
      report(result);
    } else if (result || UNTOUCHED_STATES.includes(payment.state) || !provider.holdWhilePending) {
      report({ status: 'Aborted' });
    } else {
      setNotice(`Your payment may be in progress. Use Cancel on the ${provider.name} page to go back.`);
      reveal();
    }
  };

  const busy = phase !== 'idle';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Pay with ${provider.name}`}
        testID={`${testID}-button`}
        disabled={disabled || busy}
        onPress={start}
        style={({ pressed }) => [styles.button, (disabled || busy) && styles.dimmed, pressed && styles.pressed, style]}
      >
        {phase === 'starting' ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            <Text style={styles.label}>Pay with</Text>
            <Image source={logo.source} style={{ width: logo.width, height: logo.height }} resizeMode="contain" />
          </>
        )}
      </Pressable>

      <Modal visible={phase === 'checkout' || phase === 'finishing'} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" testID={`${testID}-close`}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          {notice ? (
            <Text style={styles.notice} testID={`${testID}-notice`}>
              {notice}
            </Text>
          ) : null}
          <View style={styles.body}>
            {paymentUrl ? (
              <WebView
                ref={webView}
                source={{ uri: paymentUrl }}
                onShouldStartLoadWithRequest={(r) => (r.isTopFrame === false ? true : onNavigate(r.url))}
                onLoadStart={onLoadStart}
                onLoadEnd={onLoadEnd}
                onError={() => {
                  const s = session.current;
                  // Stopping the paypage hop surfaces as a load error of our own making.
                  if (s.returned || s.finishing) finish();
                  else if (s.reachedScheme) onClose();
                  else report({ status: 'Unavailable', error: `Failed to load the ${provider.name} page.` });
                }}
                javaScriptEnabled
                domStorageEnabled
                incognito
                setSupportMultipleWindows={false}
              />
            ) : null}
            {covered || phase === 'finishing' ? (
              <View style={styles.cover}>
                <ActivityIndicator size="large" />
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
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
  sheet: { flex: 1, backgroundColor: '#fff' },
  header: { height: 44, justifyContent: 'center', paddingHorizontal: 16 },
  close: { fontSize: 20, color: '#000' },
  notice: { marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 6, backgroundColor: '#fff4e5', color: '#663c00', fontSize: 14 },
  body: { flex: 1 },
  cover: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
