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
  isApplePaySupported,
  isSamsungPaySupported,
  configureSDK,
  executeThreeDSTwo,
} from '@network-international/react-native-ngenius';


import {
  createToken,
  createOrder,
  getOrder,
  makePayment,
} from './ngenius-apis';
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

  // Use this effect to get the status of Samsung Pay and Apple Pay availability
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
    }
  }, []);

  useEffect(() => {
    getWalletStatus();
  }, [getWalletStatus]);

  // Create an order with value of 0.3 AED
  const createFixedOrder = useCallback(
    async (token, savedCardDetails = null) => {
      const order = await createOrder(token, 30, savedCardDetails);
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
          cvv: '111',
        });
        await executeThreeDSTwo(paymentResponse);
        Alert.alert(
          'Success',
          'Payment was successful',
          [{ text: 'OK', onPress: () => console.log('OK Pressed') }],
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
        [{ text: 'OK', onPress: () => console.log('OK Pressed') }],
        { cancelable: false },
      );
    } catch (err) {
      console.log(err);
      Alert.alert(
        'Error',
        'Payment was not successful',
        [{ text: 'OK', onPress: () => console.log('OK Pressed') }],
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
      console.log(err);
      setCreatingOrder(false);
    } finally {
      setCreatingOrder(false);
      setWalletStart(false);
    }
  }, [createFixedOrder]);

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
      return !prev;
    });
  };

  const walletStartMessage = useMemo(() => {
    if (Platform.OS === 'android') {
      return 'Starting Samsung Pay...';
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
        <Text style={styles.buttonLabel}>Pay 0.3 AED using Card</Text>
      </TouchableHighlight>
      {showWallet && (
        <TouchableHighlight
          disabled={creatingOrder}
          style={StyleSheet.compose(styles.button, disabledStyle)}
          onPressOut={
            Platform.OS === 'android' ? onClickSamsungPay : onClickApplePay
          }>
          <Text style={styles.buttonLabel}>
            {`Pay 0.3 AED using ${Platform.OS === 'android' ? 'Samsung' : 'Apple'
              } Pay`}
          </Text>
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
