import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Keyboard,
  NativeModules,
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

const OUTLET_REF = 'a6b162e9-7a75-403c-b238-6303b2df455c';
const BASE_URL = 'https://paypage-sandbox.platform.network.ae';
const PREVIEW_SESSION_REF = 'preview-session';
const PREVIEW_BASE = 'https://offline-preview.invalid';
const PREVIEW_OUTLET = 'preview-outlet';
const PREVIEW_PATH = `/api/outlets/${PREVIEW_OUTLET}/payment-tokenization-sessions/${PREVIEW_SESSION_REF}`;
const CREDENTIAL_INPUT_STYLE = {
  borderWidth: 1,
  padding: 10,
  marginVertical: 8,
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
  { id: 'new', label: 'New shopper · mock Card success' },
  { id: 'declined', label: 'Card verification failed' },
  { id: 'expired', label: 'Session expires when you tap Pay' },
  { id: 'unauthorized', label: 'Invalid Access-Token on open' },
  { id: 'notFound', label: 'Outlet or session not found' },
  { id: 'loading', label: 'Slow session loading' },
  { id: 'cardForm', label: 'Native card form · preview only' },
  { id: 'cardFormUnmasked', label: 'Native card form · visible test number' },
];
const NATIVE_CARD_PREVIEW_SCENARIOS = ['cardForm', 'cardFormUnmasked'];
const EMPTY_PREVIEW_SCENARIOS = ['new', 'declined', ...NATIVE_CARD_PREVIEW_SCENARIOS];
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
  panel: { width: '90%', padding: 16 },
  title: { fontSize: 22, fontWeight: '600' },
  label: { marginTop: 12, fontWeight: '600' },
  option: { paddingVertical: 8, paddingHorizontal: 12 },
  walletInput: { borderWidth: 1, padding: 10 },
  button: { borderRadius: 22, backgroundColor: '#002E5D', padding: 14 },
  buttonText: { color: 'white', textAlign: 'center', fontWeight: '600' },
  result: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#EEF5FC',
  },
};
const ORDER = {
  action: 'VERIFY',
  paymentMethods: {
    card: ['VISA', 'MASTERCARD'],
    wallet: ['APPLE_PAY', 'GOOGLE_PAY'],
  },
};

export const previewTransport =
  scenario =>
  async ({ method }) => {
    if (method === 'PUT') {
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
        tokens: EMPTY_PREVIEW_SCENARIOS.includes(scenario) ? [] : PREVIEW_SAVED,
        ...(scenario === 'cardFormUnmasked' ? { maskPaymentInfo: false } : {}),
        paymentMethods: { card: ['VISA', 'MASTERCARD'] },
        amount: { currencyCode: 'AED', value: 100 },
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
    const present = (options, callback) => originalPresent(options, (status, response) => {
      if (status === 'Aborted' && submittedRequest === options.requestId) {
        submittedRequest = undefined;
        callback('Response', { tokens: [previewCard('preview-native-card', 'VISA', '4242', '2030-12')] });
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
      if (bridge.presentTokenizationCard === present) bridge.presentTokenizationCard = originalPresent;
      if (bridge.submitTokenizationCard === submit) bridge.submitTokenizationCard = originalSubmit;
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
        added.push(previewCard(
          `preview-added-${index}`,
          index % 2 === 0 ? 'MASTERCARD' : 'VISA',
          String(1111 + index).slice(-4),
          '2031-03',
        ));
      }
      const tokens = scenario === 'declined' ? [PREVIEW_FAILED] : added;
      const saved = EMPTY_PREVIEW_SCENARIOS.includes(scenario) ? [] : PREVIEW_SAVED;
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
  const [draft, setDraft] = useState('');
  const [sessionDraft, setSessionDraft] = useState('');
  const [sessionRef, setSessionRef] = useState('');
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
  const [walletConfig, setWalletConfig] = useState('');
  const [config, setConfig] = useState({});
  const scenario = PREVIEW_SCENARIOS[scenarioIndex];
  const brand = PREVIEW_BRANDS[merchantTheme];
  const methods = preview ? ['CARD'] : ['CARD', 'APPLE_PAY', 'GOOGLE_PAY'];
  const clear = () => {
    token.current = '';
    tokenSetAt.current = 0;
    setDraft('');
    setSessionDraft('');
    setSessionRef('');
  };
  useEffect(() => {
    return () => {
      token.current = '';
    };
  }, []);
  useEffect(() => {
    if (visible && preview) {
      return installPreviewCard(scenario.id);
    }
    return undefined;
  }, [visible, preview, scenario.id]);
  const client = useMemo(
    () =>
      createTokenizationClient({
        baseUrl: BASE_URL,
        getAccessToken: async () => {
          if (!token.current || Date.now() - tokenSetAt.current >= 300000) {
            token.current = '';
            throw new Error('Provide a fresh short-lived Access-Token');
          }
          return token.current;
        },
      }),
    [],
  );
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
  const open = () => {
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
    const accessToken = draft
      .trim()
      .replace(/^Bearer\s+/i, '')
      .trim();
    const reference = preview ? PREVIEW_SESSION_REF : sessionDraft.trim();
    Keyboard.dismiss();
    token.current = preview ? '' : accessToken;
    tokenSetAt.current = Date.now();
    setDraft('');
    setSessionDraft('');
    setSessionRef(reference);
    setConfig(parsed);
    setResult(null);
    setVisible(true);
  };
  const close = () => {
    setVisible(false);
    clear();
  };
  return (
    <View style={QA_STYLES.panel}>
      <Text style={QA_STYLES.title}>Tokenization sandbox QA</Text>
      <Text>
        Live QA requires a fresh TOKENIZATION_SDK Access-Token and the session
        reference created through the gateway by your merchant backend. Sandbox
        Card QA uses ONCE_OFF and skipConsent=true.
      </Text>
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
      <TextInput
        testID="qa-wallet-config"
        accessibilityLabel="Public UAT wallet configuration JSON"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Optional public wallet config JSON"
        value={walletConfig}
        onChangeText={setWalletConfig}
        style={QA_STYLES.walletInput}
      />
      <Text style={QA_STYLES.label}>Offline UI preview</Text>
      <Switch
        testID="qa-preview"
        accessibilityLabel="UI preview"
        value={preview}
        onValueChange={setPreview}
      />
      {preview ? (
        <>
          <TouchableOpacity
            testID="qa-preview-scenario"
            accessibilityRole="button"
            onPress={() =>
              setScenarioIndex((scenarioIndex + 1) % PREVIEW_SCENARIOS.length)
            }
            style={QA_STYLES.option}>
            <Text>Scenario: {scenario.label}</Text>
          </TouchableOpacity>
          <Text>Preview uses synthetic cards and does not take payment.</Text>
          <Text>Skip consent in preview</Text>
          <Switch
            accessibilityLabel="Preview skip consent"
            value={skipConsentPreview}
            onValueChange={setSkipConsentPreview}
          />
        </>
      ) : null}
      <TouchableOpacity
        testID="qa-merchant-theme"
        accessibilityRole="button"
        onPress={() =>
          setMerchantTheme((merchantTheme + 1) % PREVIEW_BRANDS.length)
        }
        style={QA_STYLES.option}>
        <Text>Merchant branding: {brand.name}</Text>
      </TouchableOpacity>
      <Text>Fullscreen</Text>
      <Switch
        accessibilityLabel="Fullscreen"
        value={fullscreen}
        onValueChange={setFullscreen}
      />
      <Text>Blur merchant backdrop</Text>
      <Switch
        accessibilityLabel="Blur backdrop"
        value={backdropBlur}
        onValueChange={setBackdropBlur}
      />
      <Text>Pay by card first</Text>
      <Switch
        accessibilityLabel="Pay by card first"
        value={cardFirst}
        onValueChange={setCardFirst}
      />
      <Text>Show Continue Shopping</Text>
      <Switch
        accessibilityLabel="Continue Shopping"
        value={showReturn}
        onValueChange={setShowReturn}
      />
      <Text>Show card security note</Text>
      <Switch
        accessibilityLabel="Card security note"
        value={showSecurityNote}
        onValueChange={setShowSecurityNote}
      />
      <TouchableOpacity
        testID="qa-language"
        accessibilityRole="button"
        onPress={() => setLanguage({ en: 'fr', fr: 'ar', ar: 'en' }[language])}
        style={QA_STYLES.option}>
        <Text>Language: {language.toUpperCase()} (tap EN → FR → AR)</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="qa-open-tokenization"
        accessibilityRole="button"
        onPress={open}
        style={QA_STYLES.button}>
        <Text style={QA_STYLES.buttonText}>
          {preview ? 'Open UI preview' : 'Open sandbox tokenization'}
        </Text>
      </TouchableOpacity>
      {result ? (
        <View accessibilityLiveRegion="polite" style={QA_STYLES.result}>
          <Text>SDK result {result.statusCode}</Text>
          <Text>{result.message}</Text>
          {result.statusCode === 200 && result.sessionID ? (
            <Text>Session ready for merchant checkout.</Text>
          ) : null}
        </View>
      ) : null}
      {visible ? (
        <NgeniusTokenization
          visible
          order={ORDER}
          paymentMethods={
            showReturn ? [...methods, 'CONTINUE_SHOPPING'] : methods
          }
          tokenizationClient={preview ? previewClient : client}
          outletRef={preview ? PREVIEW_OUTLET : OUTLET_REF}
          skipConsent={preview ? skipConsentPreview : true}
          language={language}
          branding={brand.branding}
          modeConfig={{
            tokenType: preview ? undefined : 'ONCE_OFF',
            addCardsBeforePay: !(preview && ['new', ...NATIVE_CARD_PREVIEW_SCENARIOS].includes(scenario.id)),
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
            if (outcome.statusCode === 200 || outcome.statusCode === 499 || !outcome.sessionID) {
              close();
            }
          }}
          onSelectionComplete={close}
          onCancel={close}
        />
      ) : null}
    </View>
  );
}
