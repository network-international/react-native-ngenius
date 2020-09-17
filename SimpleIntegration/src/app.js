import React, { useCallback, useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableHighlight,
  ActivityIndicator,
  Switch,
  Platform
} from 'react-native';
import {
  initiateCardPayment,
  initiateSamsungPay,
  initiateApplePay,
  isApplePaySupported,
  isSamsungPaySupported,
  configureSDK,
} from '@network-international/react-native-ngenius';

import { createToken, createOrder } from './ngenius-apis';

const App = () => {
  const [isEnglish, setIsEnglish] = useState(true);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [walletStart, setWalletStart] = useState(false);
  const [showWallet, setShowWallet] = useState(false);

  // Use this effect to get the status of Samsung Pay and Apple Pay availability
  const getWalletStatus = useCallback(async () => {
    if (Platform.OS === 'ios') {
      const isApplePayEnabled = await isApplePaySupported();
      setShowWallet(isApplePayEnabled);
    } else if (Platform.OS === 'android') {
      const isSamsungPayEnabled = await isSamsungPaySupported();
      setShowWallet(isSamsungPayEnabled);
    }
  }, []);

  useEffect(() => {
    getWalletStatus();
  }, []);

  // Use this effect to switch the locale of the SDK
  useEffect(() => {
    configureSDK({ language: isEnglish ? 'en' : 'ar' })
  }, [isEnglish]);

  // Create an order with value of 0.3 AED
  const createFixedOrder = useCallback(async () => {
    const token = await createToken();
    const order = await createOrder(token, 30);
    return order;
  }, []);


  // When card is selected as mode of payment
  const onClickPay = async () => {
    try {
      setCreatingOrder(true);
      const order = await createFixedOrder();
      const resp = await initiateCardPayment(order);
    } catch (err) {
      console.log({ err });
    } finally {
      setCreatingOrder(false);
    }
  };

  // When Samsung pay is selected as mode of payment
  const onClickSamsungPay = useCallback(async () => {
    // Create order
    try {
      setCreatingOrder(true);
      const order = await createFixedOrder();
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
      const order = await createFixedOrder();
      setWalletStart(true);
      // Attempt Apple Pay
      await initiateApplePay(
        order,
        {
          merchantIdentifier: '', // Merchant ID created in Apple's portal
          countryCode: 'AE' // Country code of the order
        },
      );
    } catch (err) {
      console.log(err);
      setCreatingOrder(false);
    } finally {
      setCreatingOrder(false);
      setWalletStart(false);
    }
  });

  const disabledStyle = useMemo(
    () => ({ backgroundColor: creatingOrder ? 'gray' : 'black' }),
    [creatingOrder],
  );

  const toggleSwitch = () => {
    setIsEnglish(prev => !prev);
  }

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
      <TouchableHighlight
        disabled={creatingOrder}
        style={StyleSheet.compose(styles.button, disabledStyle)}
        onPressOut={onClickPay}>
        <Text style={styles.buttonLabel}>Pay 0.3 AED using Card</Text>
      </TouchableHighlight>
      {showWallet && <TouchableHighlight
        disabled={creatingOrder}
        style={StyleSheet.compose(styles.button, disabledStyle)}
        onPressOut={Platform.OS === 'android' ? onClickSamsungPay : onClickApplePay}>
        <Text style={styles.buttonLabel}>
          {`Pay 0.3 AED using ${Platform.OS === 'android' ? 'Samsung' : 'Apple'} Pay`}
        </Text>
      </TouchableHighlight>}
      <Text style={{ paddingVertical: 20 }}>
        {isEnglish ? "English" : "Arabic"}
      </Text>
      <Switch
        trackColor={{ false: "#FFFFFF", true: "#000000" }}
        thumbColor={isEnglish ? "#FFFFFF" : "#FFFFFF"}
        ios_backgroundColor="#FFFFFF"
        onValueChange={toggleSwitch}
        value={isEnglish}
      />
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
