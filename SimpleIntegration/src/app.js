import React, { useCallback, useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableHighlight,
  ActivityIndicator,
} from 'react-native';
import { initiateCardPayment, initiateSamsungPay } from 'react-native-ni-sdk';

import { createToken, createOrder } from './ngenius-apis';

const App = () => {
  const [loading, setLoading] = useState(false);
  const [samsungPayStart, setSamsungPayStart] = useState(false);

  const createFixedOrder = useCallback(async () => {
    const token = await createToken();
    const order = await createOrder(token, 30);
    return order;
  }, []);

  const onClickPay = async () => {
    try {
      setLoading(true);
      const order = await createFixedOrder();
      const resp = await initiateCardPayment(order);
      console.log({ resp });
    } catch (err) {
      console.log({ err });
    } finally {
      setLoading(false);
    }
  };

  const onClickSamsungPay = useCallback(async () => {
    // Create order
    try {
      setLoading(true);
      const order = await createFixedOrder();
      setSamsungPayStart(true);
      // Attempt Samsung Pay
      await initiateSamsungPay(
        order,
        'Merchant Name',
        '69b734a0a86645329e6144',
      );
    } catch (err) {
      setLoading(false);
    } finally {
      setLoading(false);
      setSamsungPayStart(false);
    }
  }, [createFixedOrder]);

  const disabledStyle = useMemo(
    () => ({ backgroundColor: loading ? 'gray' : 'black' }),
    [loading],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.welcome} testID="Label">
        NISdk Samsung Pay
      </Text>
      <TouchableHighlight
        disabled={loading}
        style={StyleSheet.compose(styles.button, disabledStyle)}
        onPressOut={onClickPay}>
        <Text style={styles.buttonLabel}>Pay 0.3 AED using Card</Text>
      </TouchableHighlight>
      <TouchableHighlight
        disabled={loading}
        style={StyleSheet.compose(styles.button, disabledStyle)}
        onPressOut={onClickSamsungPay}>
        <Text style={styles.buttonLabel}>Pay 0.3 AED using Samsung Pay</Text>
      </TouchableHighlight>
      <Text style={styles.loadingText}>
        {loading
          ? samsungPayStart
            ? 'Starting SamsungPay...'
            : 'Creating Order...'
          : ''}
      </Text>
      <ActivityIndicator
        size="large"
        color="black"
        style={styles.loader}
        animating={loading}
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
