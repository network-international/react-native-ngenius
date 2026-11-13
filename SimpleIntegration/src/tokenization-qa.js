import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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

const OUTLET_REF = 'a6b162e9-7a75-403c-b238-6303b2df455c';
const BASE_URL = 'https://paypage-sandbox.platform.network.ae';
const PREVIEW_SESSION_REF = 'preview-session';
const CREDENTIAL_INPUT_STYLE = {
  borderWidth: 1,
  padding: 10,
  marginVertical: 8,
};
const BRANDING = {
  buttonColour: '#002E5D',
  mainHeadingColour: '#002E5D',
  pageBackgroundColour: '#F5F9FC',
  footerText: 'QA Merchant',
};
const ORDER = {
  action: 'VERIFY',
  amount: { value: 100, currencyCode: 'AED', formattedValue: '1.00' },
  paymentMethods: {
    card: ['VISA', 'MASTERCARD'],
    wallet: ['APPLE_PAY', 'GOOGLE_PAY'],
  },
};

export default function TokenizationQA() {
  const [draft, setDraft] = useState('');
  const [sessionDraft, setSessionDraft] = useState('');
  const [sessionRef, setSessionRef] = useState('');
  const token = useRef('');
  const tokenSetAt = useRef(0);
  const [visible, setVisible] = useState(false);
  const [language, setLanguage] = useState('en');
  const [merchantTheme, setMerchantTheme] = useState(false);
  const [preview, setPreview] = useState(false);
  const [skipConsentPreview, setSkipConsentPreview] = useState(true);
  const [walletConfig, setWalletConfig] = useState('');
  const [config, setConfig] = useState({});
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
  const client = useMemo(
    () =>
      createTokenizationClient({
        baseUrl: BASE_URL,
        getAccessToken: async () => {
          if (!token.current || Date.now() - tokenSetAt.current >= 300000) {
            token.current = '';
            throw new Error('Provide a fresh short-lived Access-Token');
          }
          return token.current.replace(/^Bearer\s+/i, '');
        },
      }),
    [],
  );
  const previewClient = useMemo(
    () =>
      createTokenizationClient({
        baseUrl: BASE_URL,
        getAccessToken: async () => 'offline-preview-only',
        transport: async ({ method }) => {
          if (method === 'PUT') {
            return { status: 204 };
          }
          if (method !== 'GET') {
            throw new Error('Unsupported preview operation');
          }
          return {
            status: 200,
            text: JSON.stringify({
              tokens: [
                {
                  tokenRef: 'preview-card',
                  type: 'CARD',
                  status: 'VERIFIED',
                  cardDetails: {
                    scheme: 'VISA',
                    last4: '4242',
                    expiry: '2030-12',
                  },
                },
              ],
            }),
          };
        },
      }),
    [],
  );
  const open = () => {
    let parsed;
    try {
      parsed = walletConfig.trim() ? JSON.parse(walletConfig) : {};
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
    if (!preview && !draft.trim()) {
      Alert.alert(
        'Access-Token required',
        'Paste a fresh TOKENIZATION_SDK Access-Token.',
      );
      return;
    }
    if (!preview && !sessionDraft.trim()) {
      Alert.alert(
        'Session reference required',
        'Paste the sessionRef from your merchant backend.',
      );
      return;
    }
    token.current = preview ? '' : draft.trim();
    tokenSetAt.current = Date.now();
    setDraft('');
    setSessionDraft('');
    setSessionRef(preview ? PREVIEW_SESSION_REF : sessionDraft.trim());
    setConfig(parsed);
    setVisible(true);
  };
  return (
    <View style={{ width: '90%', padding: 16 }}>
      <Text style={{ fontSize: 22 }}>Tokenization sandbox QA</Text>
      <Text>
        Live QA requires a merchant-created session reference and a fresh
        TOKENIZATION_SDK Access-Token. Both stay in memory and clear on close.
        Sandbox uses skipConsent=true.
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
        accessibilityLabel="Merchant session reference"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="none"
        autoComplete="off"
        placeholder="Paste merchant session reference"
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
        style={{ borderWidth: 1, padding: 10 }}
      />
      <Text>UI preview (no network)</Text>
      <Switch
        testID="qa-preview"
        accessibilityLabel="UI preview"
        value={preview}
        onValueChange={setPreview}
      />
      {preview ? (
        <>
          <Text>Skip consent in preview</Text>
          <Switch
            accessibilityLabel="Preview skip consent"
            value={skipConsentPreview}
            onValueChange={setSkipConsentPreview}
          />
        </>
      ) : null}
      <Text>Merchant theme</Text>
      <Switch
        accessibilityLabel="Tokenization merchant theme"
        value={merchantTheme}
        onValueChange={setMerchantTheme}
      />
      <TouchableOpacity
        testID="qa-language"
        accessibilityRole="button"
        onPress={() => setLanguage({ en: 'fr', fr: 'ar', ar: 'en' }[language])}
        style={{ padding: 10 }}>
        <Text>Language: {language.toUpperCase()} (tap EN → FR → AR)</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="qa-open-tokenization"
        accessibilityRole="button"
        onPress={open}
        style={{ backgroundColor: '#002E5D', padding: 16 }}>
        <Text style={{ color: 'white' }}>
          Open {preview ? 'UI preview' : 'sandbox tokenization'}
        </Text>
      </TouchableOpacity>
      {visible ? (
        <NgeniusTokenization
          visible
          order={ORDER}
          paymentMethods={
            preview ? ['CARD'] : ['CARD', 'APPLE_PAY', 'GOOGLE_PAY']
          }
          tokenizationClient={preview ? previewClient : client}
          outletRef={OUTLET_REF}
          skipConsent={preview ? skipConsentPreview : true}
          language={language}
          branding={merchantTheme ? BRANDING : undefined}
          googlePayConfig={config.googlePay}
          applePayConfig={config.applePay}
          sessionRef={sessionRef}
          onSelectionComplete={() => {
            setVisible(false);
            clear();
            Alert.alert('Payment method selected');
          }}
          onError={() =>
            Alert.alert(
              'Tokenization incomplete',
              'No saved token was confirmed. Check the QA guide for supported scenarios.',
            )
          }
          onCancel={() => {
            setVisible(false);
            clear();
          }}
        />
      ) : null}
    </View>
  );
}
