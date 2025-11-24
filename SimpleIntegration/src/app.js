import React, { useCallback, useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableHighlight,
  ActivityIndicator,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initiateCardPayment,
  initiateSamsungPay,
  initiateApplePay,
  initiateGooglePay,
  isApplePaySupported,
  isSamsungPaySupported,
  isGooglePaySupported,
  configureSDK,
  executeThreeDSTwo,
} from '@network-international/react-native-ngenius';


import {
  createToken,
  createOrder,
  getOrder,
  makePayment,
  getGooglePayConfig,
  acceptGooglePay,
} from './ngenius-apis';
import { PAYPAGE_API_URL } from './config';
import SavedCardFrame from './save-card-frame';

const SAVE_CARD_KEY = 'SAVE_CARD_KEY';

const storeData = async (key, value) => {
  try {
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
    return 1;
  } catch (e) {
    return 0;
  }
};

const getStoredData = async (key) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (e) {
    return null;
  }
};

const App = () => {
  const [isEnglish, setIsEnglish] = useState(true);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [walletStart, setWalletStart] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showGooglePay, setShowGooglePay] = useState(false);
  const [googlePayConfig, setGooglePayConfig] = useState(null);
  const [showAmount, setShowAmount] = useState(true);
  const [shouldSaveCard, setShouldSaveCard] = useState(false);
  const [savedCard, setSavedCard] = useState(null);

  useEffect(() => {
    configureSDK({
      language: isEnglish ? 'en' : 'ar',
      shouldShowOrderAmount: showAmount,
    });
  }, [isEnglish, showAmount]);

  const fetchOnAppBoot = async () => {
    const savedCardDetailsFromStorage = await getStoredData(SAVE_CARD_KEY);
    if (savedCardDetailsFromStorage !== null) {
      setSavedCard(savedCardDetailsFromStorage);
      setShouldSaveCard(true);
    }
  };

  useEffect(() => {
    fetchOnAppBoot();
  }, []);

  // Use this effect to get the status of Samsung Pay, Apple Pay, and Google Pay availability
  const getWalletStatus = useCallback(async () => {
    if (Platform.OS === 'ios') {
      const isApplePayEnabled = await isApplePaySupported();
      setShowWallet(isApplePayEnabled);
    } else if (Platform.OS === 'android') {
      try {
        const isSamsungPayEnabled = await isSamsungPaySupported("61458396ab0c44738b7670");
        setShowWallet(isSamsungPayEnabled);
      } catch {
        setShowWallet(false);
      }
      // Check Google Pay availability
      try {
        const isGooglePayEnabled = await isGooglePaySupported({ environment: 'TEST' });
        setShowGooglePay(isGooglePayEnabled);
      } catch (e) {
        setShowGooglePay(false);
      }
    }
  }, []);

  useEffect(() => {
    getWalletStatus();
  }, [getWalletStatus]);

  // Create an order with value of 250234 AED
  const createFixedOrder = useCallback(
    async (token, savedCardDetails = null) => {
      const order = await createOrder(token, 25023400, savedCardDetails); // 250234 AED = 25023400 fils
      return order;
    },
    [],
  );

  // When card is selected as mode of payment
  const onClickPay = async () => {
    try {
      setCreatingOrder(true);
      const tk = await createToken();
      const order = await createFixedOrder(tk, savedCard);
      if (savedCard !== null) {
        // use saved card for payment
        const paymentUrl =
          order._embedded.payment[0]._links['payment:saved-card'].href;
        const { cardholderName, expiry, cardToken } = savedCard;
        const paymentResponse = await makePayment(tk, paymentUrl, {
          cardholderName,
          cardToken,
          expiry,
        });
        await executeThreeDSTwo(paymentResponse);
        Alert.alert(
          'Success',
          'Payment was successful',
          [{ text: 'OK' }],
          { cancelable: false },
        );
        return;
      }
      await initiateCardPayment(order);
      if (shouldSaveCard) {
        const token = await createToken();
        const paidOrder = await getOrder(token, order.reference);
        const cardTokenDetails = paidOrder?._embedded?.payment[0]?.savedCard;
        storeData(SAVE_CARD_KEY, cardTokenDetails);
        setSavedCard(cardTokenDetails);
      }
      Alert.alert(
        'Success',
        'Payment was successful',
        [{ text: 'OK' }],
        { cancelable: false },
      );
    } catch (err) {
      Alert.alert(
        'Error',
        'Payment was not successful',
        [{ text: 'OK' }],
        { cancelable: false },
      );
    } finally {
      setCreatingOrder(false);
    }
  };

  // When Samsung pay is selected as mode of payment
  const onClickSamsungPay = useCallback(async () => {
    // Create order
    try {
      setCreatingOrder(true);
      const tk = await createToken();
      const order = await createFixedOrder(tk);
      setWalletStart(true);
      // Attempt Samsung Pay
      await initiateSamsungPay(
        order,
        '', // Merchant name here
        '', //Your service id here
      );
    } catch (err) {
      setCreatingOrder(false);
    } finally {
      setCreatingOrder(false);
      setWalletStart(false);
    }
  }, [createFixedOrder]);

  // When Apple pay is selected as mode of payment
  const onClickApplePay = useCallback(async () => {
    // Create order
    try {
      setCreatingOrder(true);
      const tk = await createToken();
      const order = await createFixedOrder(tk);
      setWalletStart(true);
      // Attempt Apple Pay
      await initiateApplePay(order, {
        merchantIdentifier: 'com.xyz.a', // Merchant ID created in Apple's portal
        countryCode: 'AE', // Country code of the order
        merchantName: 'Test Merchant', // name of the merchant to be shown in Apple Pay button
      });
    } catch (err) {
      setCreatingOrder(false);
    } finally {
      setCreatingOrder(false);
      setWalletStart(false);
    }
  }, [createFixedOrder]);

  // When Google Pay is selected as mode of payment
  const onClickGooglePay = useCallback(async () => {
    try {
      setCreatingOrder(true);
      
      // Get token
      const tk = await createToken();
      let currentGooglePayConfig = googlePayConfig;
      
      // Create order first to get merchant reference
      const order = await createFixedOrder(tk);
      setWalletStart(true);
      
      // Get Google Pay config, passing order to try merchant reference if needed
      if (!currentGooglePayConfig) {
        currentGooglePayConfig = await getGooglePayConfig(tk, order);
        setGooglePayConfig(currentGooglePayConfig);
      }
      
      // Check if Google Pay is supported for this order (as per payment-sdk-android pattern)
      const supportedWallets = order.paymentMethods?.wallet || [];
      const isGooglePaySupported = supportedWallets.includes('GOOGLE_PAY');
      
      // Note: If wallet is not in paymentMethods, Google Pay may still work
      // but the outlet needs to be configured for Google Pay on the backend
      
      // Extract Google Pay accept URL from order response (as per payment-sdk-android pattern)
      // URL is in order._embedded.payment[0]._links['payment:google_pay'].href
      let googlePayAcceptUrl = 
        order._embedded?.payment?.[0]?._links?.['payment:google_pay']?.href ||
        order._embedded?.payment?.[0]?._links?.googlePayLink?.href;
      
      // If URL not in links, construct it manually using order structure
      // Note: This is a fallback - if Google Pay is properly configured, the URL should be in _links
      if (!googlePayAcceptUrl) {
        // Use order.outletId (not merchant reference - merchant reference caused 404)
        const outletId = order.outletId || order._embedded?.payment?.[0]?.outletId;
        const orderRef = order.reference;
        const paymentRef = order._embedded?.payment?.[0]?.reference;
        
        if (outletId && orderRef && paymentRef) {
          // Try paypage API endpoint (as per paypage-app pattern: /api/outlets/...)
          // paypage-app uses: /api/outlets/${outletRef}/orders/${orderRef}/payments/${paymentRef}/google-pay/accept
          // Instead of: /transactions/outlets/... (gateway API)
          googlePayAcceptUrl = `${PAYPAGE_API_URL}/api/outlets/${outletId}/orders/${orderRef}/payments/${paymentRef}/google-pay/accept`;
        } else {
          throw new Error('Google Pay accept URL not found in order response and cannot be constructed. Missing outletId, orderRef, or paymentRef.');
        }
      }
      
      // Initiate Google Pay payment with config
      const resp = await initiateGooglePay(order, {
        merchantName: currentGooglePayConfig.merchantInfo?.name || 'Test Merchant',
        gateway: currentGooglePayConfig.gatewayName || 'networkintl',
        gatewayMerchantId: currentGooglePayConfig.merchantGatewayId || 'BCR2DN4T263KB4BO',
        environment: currentGooglePayConfig.environment || 'TEST',
        merchantId: currentGooglePayConfig.merchantGatewayId || 'BCR2DN4T263KB4BO',
        merchantOrigin: currentGooglePayConfig.merchantOrigin || 'http://applePayChub.com',
      });
      
      if (!resp.token) {
        throw new Error('Google Pay token not received');
      }
      
      // Ensure token is a string (it should be JSON string from Google Pay)
      const tokenString = typeof resp.token === 'string' ? resp.token : JSON.stringify(resp.token);
      
      // Accept Google Pay payment using accept endpoint (as per payment-sdk-android pattern)
      await acceptGooglePay(tk, googlePayAcceptUrl, tokenString);
      
      Alert.alert(
        'Success',
        'Google Pay payment was successful',
        [{ text: 'OK' }],
        { cancelable: false },
      );
    } catch (err) {
      Alert.alert(
        'Error',
        `Google Pay payment failed: ${err.error || err.message || err.status || 'Unknown error'}`,
        [{ text: 'OK' }],
        { cancelable: false },
      );
    } finally {
      setCreatingOrder(false);
      setWalletStart(false);
    }
  }, [createFixedOrder, googlePayConfig]);

  const disabledStyle = useMemo(
    () => ({ backgroundColor: creatingOrder ? 'gray' : 'black' }),
    [creatingOrder],
  );

  const toggleSwitch = () => {
    setIsEnglish((prev) => {
      configureSDK({ language: !prev ? 'en' : 'ar' });
      return !prev;
    });
  };

  const toggleAmount = () => {
    setShowAmount((prev) => {
      configureSDK({ shouldShowOrderAmount: !prev });
      return !prev;
    });
  };

  const toggleSaveCard = () => {
    setShouldSaveCard((prev) => {
      if (prev) {
        setSavedCard(null);
        storeData(SAVE_CARD_KEY, null);
      }
      return !prev;
    });
  };

  const walletStartMessage = useMemo(() => {
    if (Platform.OS === 'android') {
      return 'Starting Wallet Payment...';
    }
    return 'Starting Apple Pay...';
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.welcome} testID="Label">
        NGenius React native SDK
      </Text>
      {savedCard && <SavedCardFrame cardDetails={savedCard} />}
      <TouchableHighlight
        disabled={creatingOrder}
        style={StyleSheet.compose(styles.button, disabledStyle)}
        onPressOut={onClickPay}>
        <Text style={styles.buttonLabel}>Pay 250234 AED using Card</Text>
      </TouchableHighlight>
      {showWallet && (
        <TouchableHighlight
          disabled={creatingOrder}
          style={StyleSheet.compose(styles.button, disabledStyle)}
          onPressOut={
            Platform.OS === 'android' ? onClickSamsungPay : onClickApplePay
          }>
          <Text style={styles.buttonLabel}>
            {`Pay 250234 AED using ${Platform.OS === 'android' ? 'Samsung' : 'Apple'
              } Pay`}
          </Text>
        </TouchableHighlight>
      )}
      {showGooglePay && Platform.OS === 'android' && (
        <TouchableHighlight
          disabled={creatingOrder}
          style={StyleSheet.compose(styles.button, disabledStyle)}
          onPressOut={onClickGooglePay}>
          <Text style={styles.buttonLabel}>Pay 250234 AED using Google Pay</Text>
        </TouchableHighlight>
      )}
      <Text style={{ paddingVertical: 20 }}>
        {shouldSaveCard ? 'Saving card' : 'Not saving card'}
      </Text>
      <Switch
        trackColor={{ false: '#808080', true: '#000000' }}
        thumbColor={shouldSaveCard ? '#FFFFFF' : '#FFFFFF'}
        onValueChange={toggleSaveCard}
        value={shouldSaveCard}
      />
      {Platform.OS === 'ios' && (
        <>
          <Text style={{ paddingVertical: 20 }}>
            {isEnglish ? 'English' : 'Arabic'}
          </Text>
          <Switch
            trackColor={{ false: '#FFFFFF', true: '#000000' }}
            thumbColor={isEnglish ? '#FFFFFF' : '#FFFFFF'}
            ios_backgroundColor="#FFFFFF"
            onValueChange={toggleSwitch}
            value={isEnglish}
          />
        </>
      )}
      {Platform.OS === 'android' && (
        <>
          <Text style={{ paddingVertical: 20 }}>
            {showAmount
              ? 'Show amount in pay button'
              : 'Hide amount in pay button'}
          </Text>
          <Switch
            trackColor={{ false: '#808080', true: '#000000' }}
            thumbColor={showAmount ? '#FFFFFF' : '#FFFFFF'}
            onValueChange={toggleAmount}
            value={showAmount}
          />
        </>
      )}
      <Text style={styles.loadingText}>
        {creatingOrder
          ? walletStart
            ? walletStartMessage
            : 'Creating Order...'
          : ''}
      </Text>
      <ActivityIndicator
        size="large"
        color="black"
        style={styles.loader}
        animating={creatingOrder}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  welcome: {
    fontSize: 30,
    textAlign: 'center',
    marginVertical: 50,
  },
  buttonLabel: { color: 'white', fontWeight: '700' },
  button: {
    width: '80%',
    height: 50,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
    marginVertical: 20,
  },
  loader: {
    marginVertical: 0,
  },
  loadingText: {
    fontSize: 20,
    marginVertical: 25,
  },
});

export default App;
