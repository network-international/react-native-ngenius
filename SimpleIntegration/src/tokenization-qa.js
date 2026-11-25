import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Keyboard,
  NativeModules,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  Switch,
  View,
  TouchableOpacity,
} from 'react-native';
import {
  NgeniusTokenization,
  createTokenizationClient,
} from '@network-international/react-native-ngenius';
const { registerCardContext } = require('../../src/tokenization/cardContext');

const PREVIEW_SESSION_REF = 'preview-session';
const PREVIEW_BASE = 'https://offline-preview.invalid';
const PREVIEW_OUTLET = 'preview-outlet';
const PREVIEW_PATH = `/api/outlets/${PREVIEW_OUTLET}/payment-tokenization-sessions/${PREVIEW_SESSION_REF}`;
const CREDENTIAL_INPUT_STYLE = {
  borderWidth: 1,
  borderColor: '#CBD5E1',
  borderRadius: 12,
  color: '#182E43',
  backgroundColor: '#FFFFFF',
  paddingHorizontal: 14,
  paddingVertical: 12,
  marginTop: 6,
};
const PREVIEW_BRANDS = [
  {
    name: 'Harbour Travel',
    branding: {
      buttonColour: '#123E66',
      buttonRolloverColour: '#092B47',
      mainHeadingColour: '#123E66',
      paymentFontColour: '#24394B',
      pageBackgroundColour: '#EFF7FD',
      backgroundColour: '#FFFFFF',
      footerText: 'Harbour Travel',
    },
  },
  {
    name: 'Citrus Market',
    branding: {
      buttonColour: '#9C402A',
      buttonRolloverColour: '#74301F',
      mainHeadingColour: '#74301F',
      paymentFontColour: '#473229',
      pageBackgroundColour: '#FFF4E5',
      backgroundColour: '#FFFDF9',
      footerText: 'Citrus Market',
    },
  },
];
const PREVIEW_SCENARIOS = [
  { id: 'saved', label: 'Saved cards' },
  { id: 'slowSelection', label: 'Slow selection · offline mock' },
  { id: 'new', label: 'New shopper · mock Card success' },
  { id: 'declined', label: 'Card verification failed' },
  { id: 'expired', label: 'Session expires when you tap Pay' },
  { id: 'unauthorized', label: 'Invalid Access-Token on open' },
  { id: 'notFound', label: 'Outlet or session not found' },
  { id: 'loading', label: 'Slow session loading' },
  { id: 'cardForm', label: 'Native card form · preview only' },
  { id: 'cardFormUnmasked', label: 'Native card form · visible test number' },
  { id: 'legacySession', label: 'Legacy top-level Get Session fields' },
];
const NATIVE_CARD_PREVIEW_SCENARIOS = ['cardForm', 'cardFormUnmasked'];
const EMPTY_PREVIEW_SCENARIOS = [
  'new',
  'declined',
  ...NATIVE_CARD_PREVIEW_SCENARIOS,
];
const previewCard = (tokenRef, scheme, last4, expiry, status = 'VERIFIED') => ({
  tokenRef,
  type: 'CARD',
  status,
  cardDetails: { scheme, last4, ...(expiry ? { expiry } : {}) },
});
const PREVIEW_SAVED = [
  previewCard('preview-card', 'VISA', '4242', '2030-12'),
  previewCard('preview-no-expiry', 'MASTERCARD', '4444'),
];
const PREVIEW_FAILED = previewCard(
  'preview-declined',
  'VISA',
  '2222',
  '2031-01',
  'FAILED',
);
const QA_STYLES = {
  root: { flex: 1, backgroundColor: '#F3F7FB' },
  body: { flex: 1 },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#526A80',
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '700', color: '#182E43' },
  subtitle: { color: '#526A80', lineHeight: 20, marginTop: 8 },
  content: { paddingHorizontal: 24, paddingBottom: 24 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#182E43',
    marginBottom: 4,
  },
  label: { marginTop: 14, color: '#182E43', fontWeight: '600' },
  helper: { color: '#526A80', fontSize: 12, lineHeight: 18, marginTop: 8 },
  option: { paddingVertical: 14 },
  optionText: { color: '#123E66', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },
  rowLabel: { color: '#182E43', flex: 1, paddingRight: 12 },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#F3F7FB',
  },
  button: { borderRadius: 16, backgroundColor: '#123E66', padding: 17 },
  buttonText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
  merchant: { flex: 1, paddingHorizontal: 24 },
  merchantMain: { flex: 1, justifyContent: 'center' },
  merchantTitle: {
    color: '#182E43',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    backgroundColor: '#E1ECF6',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 14,
  },
  badgeText: { color: '#123E66', fontSize: 12, fontWeight: '600' },
  result: {
    marginTop: 18,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#E8F0F8',
  },
  resultTitle: { color: '#182E43', fontWeight: '700', marginBottom: 6 },
};
// Offline mock of the Get Session checkout context, shaped like the Tokenization API
// Specification. Not a live UAT response.
const PREVIEW_CONTEXT = {
  paymentMethods: {
    card: ['VISA', 'MASTERCARD'],
    wallet: ['APPLE_PAY', 'GOOGLE_PAY'],
  },
  orderDetails: {
    action: 'AUTH',
    amount: { currencyCode: 'AED', value: 1500 },
    orderSummary: {
      items: [
        {
          description: 'Demo item',
          totalPrice: { currencyCode: 'AED', value: 1500 },
          quantity: 1,
          category: 'Retail',
        },
      ],
      total: { currencyCode: 'AED', value: 1500 },
    },
  },
};
// Earlier UAT shape: `tokens` and top-level checkout fields, no orderDetails.
const PREVIEW_LEGACY_CONTEXT = {
  paymentMethods: { card: ['VISA', 'MASTERCARD'] },
  amount: { currencyCode: 'AED', value: 100 },
};

export const previewTransport =
  scenario =>
  async ({ method }) => {
    if (method === 'PUT') {
      // Demo-only latency: make selection progress observable without delaying live requests.
      if (scenario === 'slowSelection') {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      return { status: scenario === 'expired' ? 401 : 204 };
    }
    if (method !== 'GET') {
      throw new Error('Unsupported preview operation');
    }
    if (scenario === 'unauthorized') {
      return { status: 401 };
    }
    if (scenario === 'notFound') {
      return { status: 404 };
    }
    if (scenario === 'loading') {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return {
      status: 200,
      text: JSON.stringify({
        [scenario === 'legacySession' ? 'tokens' : 'advisedTokens']:
          EMPTY_PREVIEW_SCENARIOS.includes(scenario) ? [] : PREVIEW_SAVED,
        ...(scenario === 'cardFormUnmasked' ? { maskPaymentInfo: false } : {}),
        ...(scenario === 'legacySession'
          ? PREVIEW_LEGACY_CONTEXT
          : PREVIEW_CONTEXT),
        tncUrl: 'https://example.com/preview-terms',
      }),
    };
  };

// Offline previews never send card data to a network transport.
const installPreviewCard = scenario => {
  const bridge = NativeModules?.NiSdk;
  if (!bridge || !DeviceEventEmitter?.emit) {
    return undefined;
  }
  if (NATIVE_CARD_PREVIEW_SCENARIOS.includes(scenario)) {
    const originalPresent = bridge.presentTokenizationCard;
    const originalSubmit = bridge.submitTokenizationCard;
    let submittedRequest;
    let timer;
    const present = (options, callback) =>
      originalPresent(options, (status, response) => {
        if (status === 'Aborted' && submittedRequest === options.requestId) {
          submittedRequest = undefined;
          callback('Response', {
            tokens: [
              previewCard('preview-native-card', 'VISA', '4242', '2030-12'),
            ],
          });
        } else {
          callback(status, response);
        }
      });
    const submit = requestId => {
      timer = setTimeout(() => {
        submittedRequest = requestId;
        bridge.cancelTokenizationCard(requestId);
      }, 2200);
    };
    bridge.presentTokenizationCard = present;
    bridge.submitTokenizationCard = submit;
    return () => {
      clearTimeout(timer);
      if (bridge.presentTokenizationCard === present)
        bridge.presentTokenizationCard = originalPresent;
      if (bridge.submitTokenizationCard === submit)
        bridge.submitTokenizationCard = originalSubmit;
    };
  }
  let pending;
  let timer;
  const added = [];
  const finish = (requestId, status, response) => {
    if (pending?.id !== requestId) {
      return;
    }
    const { callback } = pending;
    pending = undefined;
    clearTimeout(timer);
    callback(status, response);
  };
  const fixture = {
    presentTokenizationCard: ({ requestId }, callback) => {
      pending = { id: requestId, callback };
      timer = setTimeout(() => {
        DeviceEventEmitter.emit('NiTokenizationCardReady', { requestId });
      }, 120);
    },
    submitTokenizationCard: requestId => {
      if (pending?.id !== requestId) {
        return;
      }
      if (scenario !== 'declined') {
        const index = added.length;
        added.push(
          previewCard(
            `preview-added-${index}`,
            index % 2 === 0 ? 'MASTERCARD' : 'VISA',
            String(1111 + index).slice(-4),
            '2031-03',
          ),
        );
      }
      const tokens = scenario === 'declined' ? [PREVIEW_FAILED] : added;
      const saved = EMPTY_PREVIEW_SCENARIOS.includes(scenario)
        ? []
        : PREVIEW_SAVED;
      timer = setTimeout(
        () => finish(requestId, 'Response', { tokens: [...tokens, ...saved] }),
        220,
      );
    },
    failTokenizationCard: requestId => finish(requestId, 'Failed'),
    cancelTokenizationCard: requestId => finish(requestId, 'Aborted'),
  };
  const original = Object.fromEntries(
    Object.keys(fixture).map(name => [name, bridge[name]]),
  );
  Object.assign(bridge, fixture);
  return () => {
    clearTimeout(timer);
    pending = undefined;
    Object.keys(fixture).forEach(name => {
      if (bridge[name] === fixture[name]) {
        bridge[name] = original[name];
      }
    });
  };
};

export default function TokenizationQA() {
  const [page, setPage] = useState('settings');
  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [outletDraft, setOutletDraft] = useState('');
  const [connection, setConnection] = useState({ baseUrl: '', outletRef: '' });
  const [draft, setDraft] = useState('');
  const [sessionDraft, setSessionDraft] = useState('');
  const [sessionRef, setSessionRef] = useState('');
  const [prepared, setPrepared] = useState(false);
  const token = useRef('');
  const tokenSetAt = useRef(0);
  const [visible, setVisible] = useState(false);
  const [language, setLanguage] = useState('en');
  const [merchantTheme, setMerchantTheme] = useState(0);
  const [preview, setPreview] = useState(false);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [backdropBlur, setBackdropBlur] = useState(false);
  const [cardFirst, setCardFirst] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [showSecurityNote, setShowSecurityNote] = useState(false);
  const [result, setResult] = useState(null);
  const [skipConsentPreview, setSkipConsentPreview] = useState(true);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
  const [walletConfig, setWalletConfig] = useState('');
  const [config, setConfig] = useState({});
  const scenario = PREVIEW_SCENARIOS[scenarioIndex];
  const brand = PREVIEW_BRANDS[merchantTheme];
  const clear = () => {
    token.current = '';
    tokenSetAt.current = 0;
    setDraft('');
    setSessionDraft('');
    setSessionRef('');
    setPrepared(false);
  };
  useEffect(
    () => () => {
      token.current = '';
    },
    [],
  );
  useEffect(() => {
    if (visible && preview) {
      return installPreviewCard(scenario.id);
    }
    return undefined;
  }, [visible, preview, scenario.id]);
  // The live client is created only after runtime connection details are supplied.
  const client = useMemo(() => {
    if (preview || !connection.baseUrl) {
      return undefined;
    }
    return createTokenizationClient({
      baseUrl: connection.baseUrl,
      getAccessToken: async () => {
        if (!token.current || Date.now() - tokenSetAt.current >= 300000) {
          token.current = '';
          throw new Error('Provide a fresh short-lived Access-Token');
        }
        return token.current;
      },
    });
  }, [connection.baseUrl, preview]);
  const previewClient = useMemo(() => {
    const fixture = createTokenizationClient({
      baseUrl: PREVIEW_BASE,
      getAccessToken: async () => 'offline-preview-only',
      transport: previewTransport(scenario.id),
    });
    return registerCardContext(fixture, {
      prepareRequest: async () => ({
        url: `${PREVIEW_BASE}${PREVIEW_PATH}/cards`,
        accessToken: 'offline-preview-only',
      }),
    });
  }, [scenario.id]);
  const continueToMerchant = () => {
    const baseUrl = baseUrlDraft.trim().replace(/\/+$/, '');
    if (!preview && !/^https?:\/\/[^/?#@\s]+(?:\/[^?#\s]*)?$/.test(baseUrl)) {
      Alert.alert(
        'Connection settings',
        'Enter the base URL for your test environment.',
      );
      return;
    }
    let parsed;
    try {
      parsed = !preview && walletConfig.trim() ? JSON.parse(walletConfig) : {};
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error();
      }
    } catch {
      Alert.alert(
        'Wallet config',
        'Provide valid public UAT wallet configuration JSON.',
      );
      return;
    }
    Keyboard.dismiss();
    setConnection({ baseUrl, outletRef: outletDraft.trim() });
    setConfig(parsed);
    setPrepared(true);
    setResult(null);
    setPage('merchant');
  };
  const open = () => {
    if (!preview && !prepared) {
      setPage('settings');
      return;
    }
    Keyboard.dismiss();
    token.current = preview
      ? ''
      : draft
          .trim()
          .replace(/^Bearer\s+/i, '')
          .trim();
    tokenSetAt.current = Date.now();
    setSessionRef(preview ? PREVIEW_SESSION_REF : sessionDraft.trim());
    setDraft('');
    setSessionDraft('');
    setResult(null);
    setVisible(true);
  };
  const close = () => {
    setVisible(false);
    clear();
  };
  const toggleRow = (label, accessibilityLabel, value, onValueChange) => (
    <View style={QA_STYLES.row}>
      <Text style={QA_STYLES.rowLabel}>{label}</Text>
      <Switch
        accessibilityLabel={accessibilityLabel}
        value={value}
        onValueChange={onValueChange}
      />
    </View>
  );
  return (
    <SafeAreaView style={QA_STYLES.root}>
      {page === 'settings' ? (
        <KeyboardAvoidingView
          testID="qa-settings-screen"
          style={QA_STYLES.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={QA_STYLES.header}>
            <Text style={QA_STYLES.eyebrow}>N-GENIUS · DEMO SETUP</Text>
            <Text style={QA_STYLES.title}>Settings</Text>
            <Text style={QA_STYLES.subtitle}>
              Prepare the checkout, then open the merchant screen.
            </Text>
          </View>
          <ScrollView
            contentContainerStyle={QA_STYLES.content}
            keyboardShouldPersistTaps="handled">
            <View style={QA_STYLES.card}>
              <View style={QA_STYLES.row}>
                <Text style={QA_STYLES.sectionTitle}>Offline UI preview</Text>
                <Switch
                  testID="qa-preview"
                  accessibilityLabel="UI preview"
                  value={preview}
                  onValueChange={value => {
                    setPreview(value);
                    setPrepared(false);
                  }}
                />
              </View>
              {preview ? (
                <>
                  <Text style={QA_STYLES.helper}>
                    Synthetic cards and session data only. No UAT requests or
                    payments.
                  </Text>
                  <TouchableOpacity
                    testID="qa-preview-scenario"
                    accessibilityRole="button"
                    onPress={() =>
                      setScenarioIndex(
                        (scenarioIndex + 1) % PREVIEW_SCENARIOS.length,
                      )
                    }
                    style={QA_STYLES.option}>
                    <Text style={QA_STYLES.optionText}>
                      Scenario: {scenario.label}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="qa-merchant-theme"
                    accessibilityRole="button"
                    onPress={() =>
                      setMerchantTheme(
                        (merchantTheme + 1) % PREVIEW_BRANDS.length,
                      )
                    }
                    style={QA_STYLES.option}>
                    <Text style={QA_STYLES.optionText}>
                      Merchant branding: {brand.name}
                    </Text>
                  </TouchableOpacity>
                  {toggleRow(
                    'Skip consent in preview',
                    'Preview skip consent',
                    skipConsentPreview,
                    setSkipConsentPreview,
                  )}
                </>
              ) : (
                <>
                  <Text style={QA_STYLES.helper}>
                    Use your merchant’s environment and a fresh TOKENIZATION_SDK
                    Access-Token. API keys stay on the merchant backend.
                  </Text>
                  <Text style={QA_STYLES.label}>Environment base URL</Text>
                  <TextInput
                    testID="qa-base-url"
                    accessibilityLabel="Environment base URL"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="Enter environment base URL"
                    value={baseUrlDraft}
                    onChangeText={setBaseUrlDraft}
                    style={CREDENTIAL_INPUT_STYLE}
                  />
                  <Text style={QA_STYLES.label}>Outlet ID</Text>
                  <TextInput
                    testID="qa-outlet-ref"
                    accessibilityLabel="Merchant outlet ID"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Enter merchant outlet ID"
                    value={outletDraft}
                    onChangeText={setOutletDraft}
                    style={CREDENTIAL_INPUT_STYLE}
                  />
                  <Text style={QA_STYLES.label}>SDK Access-Token</Text>
                  <TextInput
                    testID="qa-access-token"
                    accessibilityLabel="Short-lived Access-Token"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="none"
                    autoComplete="off"
                    placeholder="Paste short-lived Access-Token"
                    value={draft}
                    onChangeText={setDraft}
                    style={CREDENTIAL_INPUT_STYLE}
                  />
                  <Text style={QA_STYLES.label}>Session reference</Text>
                  <TextInput
                    testID="qa-session-ref"
                    accessibilityLabel="Gateway-created merchant session reference"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="none"
                    autoComplete="off"
                    placeholder="Paste gateway-created session reference"
                    value={sessionDraft}
                    onChangeText={setSessionDraft}
                    style={CREDENTIAL_INPUT_STYLE}
                  />
                  <Text style={QA_STYLES.helper}>
                    Create the session through the gateway first. Amount,
                    summary and supported card schemes are loaded by the SDK
                    from Get Session.
                  </Text>
                </>
              )}
            </View>
            <View style={QA_STYLES.card}>
              <TouchableOpacity
                testID="qa-appearance-options"
                accessibilityRole="button"
                accessibilityState={{ expanded: appearanceOpen }}
                onPress={() => setAppearanceOpen(!appearanceOpen)}
                style={QA_STYLES.option}>
                <Text style={QA_STYLES.optionText}>
                  Presentation & language {appearanceOpen ? '−' : '+'}
                </Text>
              </TouchableOpacity>
              {appearanceOpen ? (
                <>
                  {toggleRow(
                    'Fullscreen',
                    'Fullscreen',
                    fullscreen,
                    setFullscreen,
                  )}
                  {toggleRow(
                    'Blur merchant backdrop',
                    'Blur backdrop',
                    backdropBlur,
                    setBackdropBlur,
                  )}
                  {toggleRow(
                    'Pay by card first',
                    'Pay by card first',
                    cardFirst,
                    setCardFirst,
                  )}
                  {toggleRow(
                    'Show Continue Shopping',
                    'Continue Shopping',
                    showReturn,
                    setShowReturn,
                  )}
                  {toggleRow(
                    'Show card security note',
                    'Card security note',
                    showSecurityNote,
                    setShowSecurityNote,
                  )}
                  <TouchableOpacity
                    testID="qa-language"
                    accessibilityRole="button"
                    onPress={() =>
                      setLanguage({ en: 'fr', fr: 'ar', ar: 'en' }[language])
                    }
                    style={QA_STYLES.option}>
                    <Text style={QA_STYLES.optionText}>
                      Language: {language.toUpperCase()} (tap EN → FR → AR)
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
            {!preview ? (
              <View style={QA_STYLES.card}>
                <TouchableOpacity
                  testID="qa-wallet-options"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: walletOptionsOpen }}
                  onPress={() => setWalletOptionsOpen(!walletOptionsOpen)}
                  style={QA_STYLES.option}>
                  <Text style={QA_STYLES.optionText}>
                    Optional public wallet settings{' '}
                    {walletOptionsOpen ? '−' : '+'}
                  </Text>
                </TouchableOpacity>
                {walletOptionsOpen ? (
                  <>
                    <Text style={QA_STYLES.helper}>
                      Public test configuration only. Do not paste API keys or
                      private credentials.
                    </Text>
                    <TextInput
                      testID="qa-wallet-config"
                      accessibilityLabel="Public UAT wallet configuration JSON"
                      multiline
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Optional public wallet config JSON"
                      value={walletConfig}
                      onChangeText={setWalletConfig}
                      style={CREDENTIAL_INPUT_STYLE}
                    />
                  </>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
          <View style={QA_STYLES.footer}>
            <TouchableOpacity
              testID="qa-continue"
              accessibilityRole="button"
              onPress={continueToMerchant}
              style={QA_STYLES.button}>
              <Text style={QA_STYLES.buttonText}>Open merchant demo</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View testID="qa-merchant-screen" style={QA_STYLES.body}>
          <View style={QA_STYLES.header}>
            <TouchableOpacity
              testID="qa-edit-settings"
              accessibilityRole="button"
              onPress={() => setPage('settings')}
              style={QA_STYLES.option}>
              <Text style={QA_STYLES.optionText}>‹ Settings</Text>
            </TouchableOpacity>
            <Text style={QA_STYLES.title}>
              {preview ? brand.name : 'Merchant demo'}
            </Text>
            <View style={QA_STYLES.badge}>
              <Text style={QA_STYLES.badgeText}>
                {preview
                  ? 'Offline preview · synthetic data'
                  : 'Live test environment'}
              </Text>
            </View>
          </View>
          <View style={QA_STYLES.merchant}>
            <View style={QA_STYLES.merchantMain}>
              <View style={QA_STYLES.card}>
                <Text style={QA_STYLES.merchantTitle}>Ready to check out?</Text>
                <Text style={QA_STYLES.subtitle}>
                  {preview
                    ? 'Explore the SDK with synthetic payment methods.'
                    : 'Choose a payment method securely with N-Genius.'}
                </Text>
                <View style={{ height: 24 }} />
                <TouchableOpacity
                  testID="qa-open-tokenization"
                  accessibilityRole="button"
                  onPress={open}
                  style={QA_STYLES.button}>
                  <Text style={QA_STYLES.buttonText}>
                    {preview
                      ? 'Open UI preview'
                      : prepared
                      ? 'Choose payment method'
                      : 'Set up next checkout'}
                  </Text>
                </TouchableOpacity>
                {result ? (
                  <View
                    testID="qa-result"
                    accessibilityLiveRegion="polite"
                    style={QA_STYLES.result}>
                    <Text style={QA_STYLES.resultTitle}>
                      SDK result {result.statusCode}
                    </Text>
                    <Text>{result.message}</Text>
                    {result.statusCode === 200 && result.sessionID ? (
                      <Text style={QA_STYLES.helper}>
                        Payment method selected. Session ready for the merchant
                        backend to continue payment.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
            <Text
              style={[
                QA_STYLES.helper,
                { textAlign: 'center', marginBottom: 24 },
              ]}>
              {preview
                ? 'Preview only. No payment is taken.'
                : 'The SDK selects a payment method. Your merchant backend completes the payment.'}
            </Text>
          </View>
        </View>
      )}
      {visible ? (
        <NgeniusTokenization
          visible
          paymentMethods={showReturn ? ['CONTINUE_SHOPPING'] : undefined}
          tokenizationClient={preview ? previewClient : client}
          outletRef={preview ? PREVIEW_OUTLET : connection.outletRef}
          skipConsent={preview ? skipConsentPreview : true}
          language={language}
          branding={preview ? brand.branding : undefined}
          modeConfig={{
            tokenType: preview ? undefined : 'ONCE_OFF',
            addCardsBeforePay: !(
              preview &&
              ['new', ...NATIVE_CARD_PREVIEW_SCENARIOS].includes(scenario.id)
            ),
            presentation: fullscreen ? 'fullscreen' : 'bottomSheet',
            backdropBlur,
            sectionOrder: cardFirst ? ['card', 'tokens', 'wallets'] : undefined,
            showSecurityNote,
          }}
          googlePayConfig={config.googlePay}
          applePayConfig={config.applePay}
          sessionRef={sessionRef}
          onResult={outcome => {
            setResult(outcome);
            if (
              outcome.statusCode === 200 ||
              outcome.statusCode === 499 ||
              !outcome.sessionID
            ) {
              close();
            }
          }}
          onSelectionComplete={close}
          onCancel={close}
        />
      ) : null}
    </SafeAreaView>
  );
}
