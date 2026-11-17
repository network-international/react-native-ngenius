/**
 * "Pay with AANI" (UAE instant payments) button for react-native-ngenius.
 *
 *   import { AaniButton } from '@network-international/react-native-ngenius/aani';
 *
 *   <AaniButton order={order} onResult={({ status, error }) => ...} />
 *
 * Pure React Native: no WebView and no extra dependencies (the QR code is drawn with plain views).
 *
 * Renders nothing unless the order offers AANI. `onResult` receives `{ status, state?, error? }`:
 *  - 'Success'         paid
 *  - 'PostAuthReview'  paid but under review; hold fulfilment
 *  - 'Failed'          declined, or not approved in time; check the order
 *  - 'Aborted'         the payer closed AANI before sending a request, or cancelled the QR
 *  - 'Unavailable'     never returned by AANI today; listed for parity with the other buttons
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import qrcode from './vendor/qrcode-generator';
import {
  AANI_TIMEOUT_MS,
  ALIAS_TYPES,
  aaniConfig,
  authorize,
  cancelQr,
  createQr,
  finalResult,
  formatAmount,
  payerIp,
  readState,
  requestToPay,
} from './aani-core';

export { isAaniAvailable } from './aani-core';

const AANI_LOGO = require('./assets/aani.png');
const ALIAS_POLL_MS = 6000;
const QR_POLL_MS = 5000;
const QR_TAB = { key: 'QR_CODE', label: 'QR code' };

export function AaniButton({ order, onResult, disabled, style }) {
  const config = useMemo(() => aaniConfig(order), [order]);
  // closed | form | sending | waiting | qrLoading | qr
  const [phase, setPhase] = useState('closed');
  const [tab, setTab] = useState(ALIAS_TYPES[0].key);
  const [value, setValue] = useState('');
  const [error, setError] = useState();
  const [qrData, setQrData] = useState();
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());
  const session = useRef({});

  // Stop polling and timers if the button goes away mid-payment.
  useEffect(() => () => stopTimers(session.current), []);

  // The countdown the payer sees, ticking once a second while a request or QR is open.
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'qr') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  if (!config) return null;

  const report = (result) => {
    const s = session.current;
    if (s.settled) return;
    s.settled = true;
    stopTimers(s);
    setPhase('closed');
    if (onResult) onResult(result);
  };

  const fail = (e) => report({ status: (e && e.status) || 'Failed', error: (e && e.message) || String(e) });

  const open = () => {
    session.current = {};
    setTab(ALIAS_TYPES[0].key);
    setValue('');
    setError(undefined);
    setQrData(undefined);
    setPhase('form');
  };

  /** Signs in once per order, and reads the payer's IP that AANI needs. */
  const ensureSession = async () => {
    const s = session.current;
    if (!s.token) {
      const { token } = await authorize(config);
      s.token = token;
    }
    if (s.ip === undefined) s.ip = await payerIp(config);
    return s;
  };

  /** Polls `statusUrl` until the payment is final or the window closes. */
  const poll = (statusUrl, everyMs, onTimeout) => {
    const s = session.current;
    const until = Date.now() + AANI_TIMEOUT_MS;
    setDeadline(until);
    setNow(Date.now());
    const tick = async () => {
      if (s.settled || s.pollUrl !== statusUrl) return;
      try {
        const result = finalResult(await readState(statusUrl, s.token));
        if (s.settled || s.pollUrl !== statusUrl) return;
        if (result) {
          report(result);
          return;
        }
      } catch (e) {
        fail(e);
        return;
      }
      if (Date.now() >= until) onTimeout();
      else s.pollTimer = setTimeout(tick, everyMs);
    };
    s.pollUrl = statusUrl;
    s.pollTimer = setTimeout(tick, everyMs);
  };

  const sendRequest = async () => {
    const type = ALIAS_TYPES.find((t) => t.key === tab);
    const normalized = type.normalize(value);
    if (!type.valid(normalized)) {
      setError(`Enter a valid ${type.label.toLowerCase()}.`);
      return;
    }
    setError(undefined);
    setPhase('sending');
    try {
      const s = await ensureSession();
      const { statusUrl, deepLink } = await requestToPay(config, s.token, type, normalized, s.ip);
      setPhase('waiting');
      if (deepLink) Linking.openURL(deepLink).catch(() => {});
      poll(statusUrl, ALIAS_POLL_MS, async () => {
        // One last read: the payer may have approved in the final seconds.
        const result = finalResult(await readState(statusUrl, s.token).catch(() => undefined));
        report(result || { status: 'Failed', error: 'The payment was not approved in time; check the order before trying again.' });
      });
    } catch (e) {
      if (e.status === 'Invalid') {
        // The alias was refused; nothing was sent to the payer, so let them correct it.
        setError(`AANI did not accept this ${type.label.toLowerCase()}. Check it and try again.`);
        setPhase('form');
      } else {
        fail(e);
      }
    }
  };

  const showQr = async () => {
    setError(undefined);
    setPhase('qrLoading');
    try {
      const s = await ensureSession();
      const qr = await createQr(config, s.token);
      s.qr = qr;
      setQrData(qr.qrData);
      setPhase('qr');
      poll(qr.statusUrl, QR_POLL_MS, async () => {
        await cancelQr(qr, s.token);
        const result = finalResult(await readState(qr.statusUrl, s.token).catch(() => undefined));
        if (result) report(result);
        else {
          s.pollUrl = undefined;
          setQrData(undefined);
          setError('The QR code expired. Generate a new one to pay.');
          setPhase('form');
        }
      });
    } catch (e) {
      if (e.httpStatus === 401) fail(e);
      else {
        setError(e.message);
        setPhase('form');
      }
    }
  };

  /** Cancels the QR, unless it was paid in the meantime. */
  const cancelQrAndClose = async () => {
    const s = session.current;
    const qr = s.qr;
    stopTimers(s);
    s.pollUrl = undefined;
    setPhase('qrLoading');
    if (qr) {
      await cancelQr(qr, s.token);
      const result = finalResult(await readState(qr.statusUrl, s.token).catch(() => undefined));
      if (result) {
        report(result);
        return;
      }
    }
    report({ status: 'Aborted' });
  };

  const onClose = () => {
    // While a request is out the payer may still approve it in their bank app, so the sheet stays
    // until the outcome is known or the timer runs out, as on native.
    if (phase === 'waiting' || phase === 'sending' || phase === 'qrLoading') return;
    if (phase === 'qr') {
      cancelQrAndClose();
      return;
    }
    report({ status: 'Aborted' });
  };

  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const clock = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const amount = formatAmount(config.amount);
  const tabs = config.qrUrl ? [...ALIAS_TYPES, QR_TAB] : ALIAS_TYPES;
  const aliasType = ALIAS_TYPES.find((t) => t.key === tab);
  const canClose = phase === 'form' || phase === 'qr';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pay with AANI"
        testID="ngenius-aani-button"
        disabled={disabled || phase !== 'closed'}
        onPress={open}
        style={({ pressed }) => [styles.button, disabled && styles.dimmed, pressed && styles.pressed, style]}
      >
        <Text style={styles.label}>Pay with</Text>
        <Image source={AANI_LOGO} style={styles.logo} resizeMode="contain" />
      </Pressable>

      <Modal visible={phase !== 'closed'} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            {canClose ? (
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close" testID="ngenius-aani-close">
                <Text style={styles.close}>✕</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Image source={AANI_LOGO} style={styles.headerLogo} resizeMode="contain" />
            <View style={styles.headerSpacer} />
          </View>

          <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {phase === 'form' ? (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.amount}>Paying {amount}</Text>
                <View style={styles.tabs}>
                  {tabs.map((t) => (
                    <Pressable
                      key={t.key}
                      testID={`ngenius-aani-tab-${t.key}`}
                      onPress={() => {
                        setTab(t.key);
                        setValue('');
                        setError(undefined);
                      }}
                      style={[styles.tab, tab === t.key && styles.tabSelected]}
                    >
                      <Text style={[styles.tabText, tab === t.key && styles.tabTextSelected]}>{t.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {tab === QR_TAB.key ? (
                  <Text style={styles.hint}>Show a QR code to scan with your banking app.</Text>
                ) : (
                  <View style={styles.inputRow}>
                    {tab === 'MOBILE_NUMBER' ? <Text style={styles.prefix}>+971</Text> : null}
                    <TextInput
                      testID="ngenius-aani-input"
                      style={styles.input}
                      value={value}
                      onChangeText={(v) => {
                        setValue(v);
                        setError(undefined);
                      }}
                      placeholder={aliasType.placeholder}
                      keyboardType={aliasType.keyboardType}
                      autoCapitalize={tab === 'PASSPORT_ID' ? 'characters' : 'none'}
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={sendRequest}
                    />
                  </View>
                )}

                {error ? (
                  <Text style={styles.error} testID="ngenius-aani-error">
                    {error}
                  </Text>
                ) : null}

                <Pressable
                  testID="ngenius-aani-submit"
                  accessibilityRole="button"
                  onPress={tab === QR_TAB.key ? showQr : sendRequest}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryText}>{tab === QR_TAB.key ? 'Generate QR code' : 'Request to Pay'}</Text>
                </Pressable>
              </ScrollView>
            ) : null}

            {phase === 'sending' || phase === 'qrLoading' ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" />
              </View>
            ) : null}

            {phase === 'waiting' ? (
              <View style={styles.center} testID="ngenius-aani-waiting">
                <Text style={styles.amount}>Paying {amount}</Text>
                <Text style={styles.clock}>{clock}</Text>
                <Text style={styles.hint}>Tap the notification received in your banking app to complete the payment.</Text>
                <Text style={styles.note}>Please keep this screen open while the timer is running.</Text>
                <ActivityIndicator style={styles.spinner} />
              </View>
            ) : null}

            {phase === 'qr' && qrData ? (
              <ScrollView contentContainerStyle={[styles.content, styles.centerItems]} testID="ngenius-aani-qr">
                <Text style={styles.amount}>Paying {amount}</Text>
                <QrCode data={qrData} size={240} />
                <Text style={styles.clock}>{clock}</Text>
                <Text style={styles.hint}>Scan the QR code → approve the payment → done</Text>
                <Pressable
                  testID="ngenius-aani-cancel-qr"
                  onPress={cancelQrAndClose}
                  style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
              </ScrollView>
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function stopTimers(s) {
  clearTimeout(s.pollTimer);
  s.pollTimer = undefined;
}

/** A QR code drawn with plain views: one row per module row, dark runs merged into single cells. */
function QrCode({ data, size }) {
  const rows = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(data);
    qr.make();
    const n = qr.getModuleCount();
    const out = [];
    for (let r = 0; r < n; r++) {
      const runs = [];
      let c = 0;
      while (c < n) {
        const dark = qr.isDark(r, c);
        let len = 1;
        while (c + len < n && qr.isDark(r, c + len) === dark) len++;
        runs.push({ dark, len });
        c += len;
      }
      out.push(runs);
    }
    return { n, out };
  }, [data]);
  const quiet = 4; // the quiet zone scanners need, in modules
  // Whole device pixels per module: fractional sizes leave hairline seams that stop scanners.
  const ratio = PixelRatio.get();
  const cell = Math.max(1, Math.floor((size * ratio) / (rows.n + quiet * 2))) / ratio;
  const side = cell * (rows.n + quiet * 2);
  return (
    <View style={{ width: side, height: side, padding: cell * quiet, backgroundColor: '#fff' }} accessibilityLabel="AANI QR code">
      {rows.out.map((runs, r) => (
        <View key={r} style={{ flexDirection: 'row', height: cell }}>
          {runs.map((run, i) => (
            <View key={i} style={{ width: cell * run.len, height: cell, backgroundColor: run.dark ? '#000' : '#fff' }} />
          ))}
        </View>
      ))}
    </View>
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
  label: { fontSize: 16, fontWeight: '600', color: '#000', marginRight: 6 },
  // The AANI wordmark is 539x283.
  logo: { width: 61, height: 32 },
  sheet: { flex: 1, backgroundColor: '#fff' },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  close: { fontSize: 20, color: '#000', width: 24 },
  headerLogo: { width: 76, height: 40 },
  headerSpacer: { width: 24 },
  body: { flex: 1 },
  content: { padding: 16 },
  centerItems: { alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  amount: { fontSize: 18, fontWeight: '600', color: '#000', marginBottom: 16, textAlign: 'center' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#d0d0d0', marginRight: 8, marginBottom: 8 },
  tabSelected: { backgroundColor: '#000', borderColor: '#000' },
  tabText: { fontSize: 14, color: '#000' },
  tabTextSelected: { color: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d0d0d0', borderRadius: 8, paddingHorizontal: 12, height: 48 },
  prefix: { fontSize: 16, color: '#555', marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: '#000', paddingVertical: 0 },
  hint: { fontSize: 14, color: '#333', textAlign: 'center', marginVertical: 12 },
  note: { fontSize: 13, color: '#777', textAlign: 'center' },
  error: { color: '#c62828', fontSize: 14, marginTop: 8 },
  primary: { height: 48, borderRadius: 8, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: { height: 44, paddingHorizontal: 32, borderRadius: 8, borderWidth: 1, borderColor: '#000', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryText: { color: '#000', fontSize: 16, fontWeight: '600' },
  clock: { fontSize: 32, fontWeight: '700', color: '#000', marginVertical: 12, fontVariant: ['tabular-nums'] },
  spinner: { marginTop: 16 },
});
