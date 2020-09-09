import React from 'react';
import { render } from '@testing-library/react-native';
import App from './app';

jest.mock('react-native-ni-sdk', () => ({
  initiateCardPayment: jest.fn(),
  initiateSamsungPay: jest.fn()
}));


describe('App test', () => {
  it('should render the app', () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId('Label')).toHaveTextContent('NISdk Samsung Pay');
  });
});
