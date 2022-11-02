import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

const capitalizeFirstLetter = (string) => {
  return string.charAt(0).toUpperCase() + string.slice(1);
};

const SavedCardFrame = ({ cardDetails }) => {
  const { cardholderName, expiry, maskedPan, scheme } = cardDetails;
  return (
    <View style={styles.container}>
      <View style={styles.topContainer}>
        <Text style={styles.pan}>{maskedPan}</Text>
        <Text style={styles.cardHolderName}>{cardholderName}</Text>
      </View>
      <View style={styles.bottomContainer}>
        <Text style={styles.date}>{`Valid upto: ${expiry}`}</Text>
        <Text style={styles.scheme}>
          {capitalizeFirstLetter(scheme.toLowerCase())}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    height: 200,
    width: '90%',
    borderRadius: 20,
    flexDirection: 'column',
    padding: 30,
    justifyContent: 'space-between',
  },
  pan: {
    color: '#FFFFFF',
    letterSpacing: 5,
    fontSize: 25,
    paddingBottom: 15,
  },
  cardHolderName: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  date: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  scheme: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  bottomContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topContainer: { flexDirection: 'column' },
});

export default SavedCardFrame;
