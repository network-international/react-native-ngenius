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
    console.log('[fetchOnAppBoot] Loading saved card from AsyncStorage...');
    const savedCardDetailsFromStorage = await getStoredData(SAVE_CARD_KEY);
    console.log('[fetchOnAppBoot] AsyncStorage result:', {
      hasData: savedCardDetailsFromStorage !== null,
      data: savedCardDetailsFromStorage,
      keys: savedCardDetailsFromStorage ? Object.keys(savedCardDetailsFromStorage) : [],
    });
    if (savedCardDetailsFromStorage !== null) {
      setSavedCard(savedCardDetailsFromStorage);
      setShouldSaveCard(true);
      console.log('[fetchOnAppBoot] ✅ Saved card loaded and state updated');
    } else {
      console.log('[fetchOnAppBoot] No saved card found in storage');
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
      console.log('[createFixedOrder] Creating order:', {
        amount: 25023400,
        currency: 'AED',
        hasSavedCardDetails: savedCardDetails !== null,
        savedCardDetails: savedCardDetails ? {
          hasCardToken: Boolean(savedCardDetails.cardToken),
          hasExpiry: Boolean(savedCardDetails.expiry),
          hasCardholderName: Boolean(savedCardDetails.cardholderName),
          keys: Object.keys(savedCardDetails),
        } : null,
      });
      const order = await createOrder(token, 25023400, savedCardDetails); // 250234 AED = 25023400 fils
      console.log('[createFixedOrder] Order response received');
      return order;
    },
    [],
  );

  // When card is selected as mode of payment
  const onClickPay = async () => {
    try {
      setCreatingOrder(true);
      console.log('[onClickPay] ========== START ==========');
      console.log('[onClickPay] Initial state:', {
        hasSavedCard: savedCard !== null,
        shouldSaveCard,
        savedCardDetails: savedCard ? {
          hasCardToken: Boolean(savedCard.cardToken),
          hasExpiry: Boolean(savedCard.expiry),
          hasCardholderName: Boolean(savedCard.cardholderName),
          hasMaskedPan: Boolean(savedCard.maskedPan),
          hasScheme: Boolean(savedCard.scheme),
          allKeys: Object.keys(savedCard),
        } : null,
      });
      
      console.log('[onClickPay] Step 1: Creating access token...');
      const tk = await createToken();
      console.log('[onClickPay] ✅ Token created:', {
        tokenLength: tk?.length,
        tokenPreview: tk ? `${tk.substring(0, 20)}...` : null,
      });
      
      console.log('[onClickPay] Step 2: Creating order with savedCard:', savedCard);
      const order = await createFixedOrder(tk, savedCard);
      console.log('[onClickPay] ✅ Order created:', {
        orderRef: order?.reference,
        outletId: order?.outletId,
        amount: order?.amount,
        currencyCode: order?.amount?.currencyCode,
        paymentMethods: order?.paymentMethods,
        paymentLinks: order?._embedded?.payment?.[0]?._links
          ? Object.keys(order._embedded.payment[0]._links)
          : [],
        paymentLinksFull: order?._embedded?.payment?.[0]?._links,
        paymentState: order?._embedded?.payment?.[0]?.state,
        paymentRef: order?._embedded?.payment?.[0]?.reference,
        hasSavedCardInOrder: Boolean(order?._embedded?.payment?.[0]?.savedCard),
        savedCardInOrder: order?._embedded?.payment?.[0]?.savedCard,
      });
      
      if (savedCard !== null) {
        console.log('[onClickPay] ========== SAVED CARD FLOW ==========');
        console.log('[onClickPay] Using saved card for payment');
        const savedCardLink = order._embedded?.payment?.[0]?._links?.['payment:saved-card'];
        console.log('[onClickPay] Saved-card link:', {
          exists: Boolean(savedCardLink),
          href: savedCardLink?.href,
        });
        
        if (!savedCardLink || !savedCardLink.href) {
          throw new Error('payment:saved-card link not found in order response');
        }
        
        const paymentUrl = savedCardLink.href;
        console.log('[onClickPay] Step 3: Making payment with saved card:', {
          paymentUrl,
          savedCardData: {
            cardToken: savedCard.cardToken ? `${savedCard.cardToken.substring(0, 20)}...` : null,
            expiry: savedCard.expiry,
            cardholderName: savedCard.cardholderName,
            maskedPan: savedCard.maskedPan,
            scheme: savedCard.scheme,
          },
        });
        
        const { cardholderName, expiry, cardToken } = savedCard;
        const paymentBody = {
          cardholderName,
          cardToken,
          expiry,
        };
        console.log('[onClickPay] Payment request body:', {
          hasCardholderName: Boolean(cardholderName),
          hasCardToken: Boolean(cardToken),
          hasExpiry: Boolean(expiry),
          cardTokenLength: cardToken?.length,
        });
        
        const paymentResponse = await makePayment(tk, paymentUrl, paymentBody, "put");
        console.log('[onClickPay] ✅ Saved-card payment response:', {
          paymentRef: paymentResponse?.reference,
          state: paymentResponse?.state,
          status: paymentResponse?.status,
          amount: paymentResponse?.amount,
          currencyCode: paymentResponse?.amount?.currencyCode,
          fullResponse: paymentResponse,
        });

        // Saved-card payment often completes without 3DS (e.g. CAPTURED). Only run 3DS2 when the
        // backend indicates it is required (e.g. state not terminal success, or response has 3ds2).
        const terminalSuccessStates = ['CAPTURED', 'PURCHASED', 'AUTHORISED'];
        const needs3DS = paymentResponse?.state && !terminalSuccessStates.includes(paymentResponse.state)
          && paymentResponse?.['3ds2'];
        if (needs3DS) {
          console.log('[onClickPay] Step 4: Executing 3DS2...');
          await executeThreeDSTwo(paymentResponse);
          console.log('[onClickPay] ✅ 3DS2 completed');
        } else {
          console.log('[onClickPay] Step 4: Skipping 3DS (payment already complete:', paymentResponse?.state, ')');
        }

        Alert.alert(
          'Success',
          'Payment was successful',
          [{ text: 'OK' }],
          { cancelable: false },
        );
        console.log('[onClickPay] ========== SAVED CARD FLOW SUCCESS ==========');
        return;
      }
      
      console.log('[onClickPay] ========== NEW CARD FLOW ==========');
      console.log('[onClickPay] No saved card, initiating new card payment');
      console.log('[onClickPay] Step 3: Initiating card payment UI...');
      await initiateCardPayment(order);
      console.log('[onClickPay] ✅ Card payment UI completed');
      
      if (shouldSaveCard) {
        console.log('[onClickPay] Step 4: Saving card after payment...');
        const token = await createToken();
        console.log('[onClickPay] Token for getOrder:', {
          tokenLength: token?.length,
        });
        
        const paidOrder = await getOrder(token, order.reference);
        console.log('[onClickPay] ✅ Paid order retrieved:', {
          orderRef: paidOrder?.reference,
          paymentState: paidOrder?._embedded?.payment?.[0]?.state,
          hasSavedCard: Boolean(paidOrder?._embedded?.payment?.[0]?.savedCard),
        });
        
        const cardTokenDetails = paidOrder?._embedded?.payment[0]?.savedCard;
        console.log('[onClickPay] Saved-card details from paid order:', {
          hasCardTokenDetails: Boolean(cardTokenDetails),
          keys: cardTokenDetails ? Object.keys(cardTokenDetails) : [],
          fullDetails: cardTokenDetails,
        });
        
        if (cardTokenDetails) {
          await storeData(SAVE_CARD_KEY, cardTokenDetails);
          setSavedCard(cardTokenDetails);
          console.log('[onClickPay] ✅ Card saved to AsyncStorage and state');
        } else {
          console.warn('[onClickPay] ⚠️ No savedCard details in paid order response');
        }
      } else {
        console.log('[onClickPay] shouldSaveCard is false, skipping card save');
      }
      
      Alert.alert(
        'Success',
        'Payment was successful',
        [{ text: 'OK' }],
        { cancelable: false },
      );
      console.log('[onClickPay] ========== NEW CARD FLOW SUCCESS ==========');
    } catch (err) {
      console.error('[onClickPay] ========== ERROR ==========');
      console.error('[onClickPay] Error details:', {
        message: err?.message,
        status: err?.status,
        error: err?.error,
        response: err?.response,
        stack: err?.stack,
        fullError: err,
      });
      Alert.alert(
        'Error',
        'Payment was not successful',
        [{ text: 'OK' }],
        { cancelable: false },
      );
    } finally {
      setCreatingOrder(false);
      console.log('[onClickPay] ========== END ==========');
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
    console.log('[toggleSaveCard] Toggling save card:', {
      currentValue: shouldSaveCard,
      hasSavedCard: savedCard !== null,
    });
    setShouldSaveCard((prev) => {
      if (prev) {
        console.log('[toggleSaveCard] Disabling save card, clearing saved card data');
        setSavedCard(null);
        storeData(SAVE_CARD_KEY, null).then(() => {
          console.log('[toggleSaveCard] ✅ Saved card cleared from AsyncStorage');
        });
      } else {
        console.log('[toggleSaveCard] Enabling save card (will save after next payment)');
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
