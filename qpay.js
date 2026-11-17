/**
 * "Pay with NAPS" (QPay) button for react-native-ngenius.
 *
 *   import { QPayButton } from '@network-international/react-native-ngenius/qpay';
 *
 *   <QPayButton order={order} onResult={({ status, error }) => ...} />
 *
 * Kept out of the main entry point because it needs `react-native-webview`.
 *
 * Renders nothing unless the order is in QAR and offers QPay. `onResult` receives
 * `{ status, state?, error? }`:
 *  - 'Success'         paid (authorised / purchased / captured)
 *  - 'PostAuthReview'  paid but under review; hold fulfilment
 *  - 'Failed'          declined, or the outcome could not be confirmed; check the order
 *  - 'Aborted'         the payer backed out; nothing charged, the order is still payable
 *  - 'Unavailable'     QPay would not open a checkout; offer another method
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { authorize, isAcceptUrl, isCancelUrl, pollResult, qpayConfig, startCheckout } from './qpay-core';

export { isQPayAvailable } from './qpay-core';

const NAPS_LOGO = require('./assets/naps.png');

/** A page must sit still this long before it is shown, so redirect hops stay hidden. */
const REVEAL_DELAY_MS = 450;

/** Stops QCB's page zooming in when a field gets focus. */
const VIEWPORT_PIN_JS = `(function(){try{
var m=document.querySelectorAll('meta[name="viewport"]');for(var i=0;i<m.length;i++)m[i].parentNode.removeChild(m[i]);
var v=document.createElement('meta');v.name='viewport';
v.content='width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no';
(document.head||document.documentElement).appendChild(v);
var s=document.createElement('style');s.innerHTML='input, select, textarea, button { font-size: 16px !important; }';
(document.head||document.documentElement).appendChild(s);
}catch(e){}})();true;`;

export function QPayButton({ order, onResult, disabled, style }) {
  const config = useMemo(() => qpayConfig(order), [order]);
  const [phase, setPhase] = useState('idle'); // idle | starting | checkout | finishing
  const [html, setHtml] = useState();
  const [covered, setCovered] = useState(true);
  const session = useRef({});

  useEffect(() => () => clearTimeout(session.current.revealTimer), []);

  if (!config) return null;

  const report = (result) => {
    const s = session.current;
    if (s.settled) return;
    s.settled = true;
    clearTimeout(s.revealTimer);
    setPhase('idle');
    setHtml(undefined);
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
      Object.assign(session.current, { token, orderUrl });
      setCovered(true);
      setHtml(checkout.html);
      setPhase('checkout');
    } catch (e) {
      reportError(e);
    }
  };

  const finish = async () => {
    const s = session.current;
    if (s.finishing) return;
    s.finishing = true;
    setPhase('finishing');
    try {
      report(await pollResult(s.orderUrl, s.token));
    } catch (e) {
      reportError(e);
    }
  };

  // QCB comes back with form POSTs, and Android only reports those as a page starting to load,
  // so returns are spotted when a load starts and acted on when it ends, as the native SDKs do.
  const onLoadStart = ({ nativeEvent }) => {
    const s = session.current;
    if (isCancelUrl(nativeEvent.url)) s.sawCancel = true;
    if (isAcceptUrl(nativeEvent.url)) s.sawAccept = true;
    clearTimeout(s.revealTimer);
    setCovered(true);
  };

  const onLoadEnd = () => {
    const s = session.current;
    if (s.sawCancel) {
      // Checked first: a cancel that also passed through /qpay/accept is still a cancel.
      report({ status: 'Aborted' });
      return;
    }
    if (s.sawAccept) {
      finish();
      return;
    }
    clearTimeout(s.revealTimer);
    s.revealTimer = setTimeout(() => setCovered(false), REVEAL_DELAY_MS);
  };

  const onClose = () => {
    // Once QCB has reported back, the order decides.
    if (session.current.sawAccept) return;
    report({ status: 'Aborted' });
  };

  const busy = phase !== 'idle';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pay with NAPS"
        testID="ngenius-qpay-button"
        disabled={disabled || busy}
        onPress={start}
        style={({ pressed }) => [styles.button, (disabled || busy) && styles.dimmed, pressed && styles.pressed, style]}
      >
        {phase === 'starting' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.label}>Pay with</Text>
            <Image source={NAPS_LOGO} style={styles.logo} resizeMode="contain" />
          </>
        )}
      </Pressable>

      <Modal visible={phase === 'checkout' || phase === 'finishing'} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" testID="ngenius-qpay-close">
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.body}>
            {html ? (
              <WebView
                source={{ html, baseUrl: config.baseUrl }}
                originWhitelist={['*']}
                onLoadStart={onLoadStart}
                onLoadEnd={onLoadEnd}
                onError={() => {
                  if (!session.current.sawAccept) report({ status: 'Failed', error: 'Failed to load the QPay page.' });
                }}
                injectedJavaScript={VIEWPORT_PIN_JS}
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
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  label: { fontSize: 16, fontWeight: '600', color: '#fff', marginRight: 8 },
  // The NAPS wordmark is 4.63:1.
  logo: { width: 74, height: 16 },
  sheet: { flex: 1, backgroundColor: '#fff' },
  header: { height: 44, justifyContent: 'center', paddingHorizontal: 16 },
  close: { fontSize: 20, color: '#000' },
  body: { flex: 1 },
  cover: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
