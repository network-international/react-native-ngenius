import axios from 'axios';

const REALM = 'ni'; // add your realm
const OUTLET_ID = ''; // add your outletId
const API_KEY = ''; // add your api key
const IDENTITY_API_URL =
  'https://api-gateway.sandbox.ngenius-payments.com/identity/auth/access-token';
const GATEWAY_API_URL = `https://api-gateway.sandbox.ngenius-payments.com/transactions/outlets/${OUTLET_ID}/orders`;

export const createToken = async () => {
  try {
    const { data } = await axios({
      method: 'post',
      url: IDENTITY_API_URL,
      headers: {
        Accept: 'application/vnd.ni-identity.v1+json',
        'Content-Type': 'application/vnd.ni-identity.v1+json',
        Authorization: `Basic ${API_KEY}`,
      },
    });
    const { access_token } = data;
    return access_token;
  } catch (err) {
    return err;
  }
};

export const createOrder = async (accessToken, amount, savedCard = null) => {
  const body = {
    action: 'SALE',
    amount: {
      currencyCode: 'AED',
      value: amount,
    },
  };
  if (savedCard) {
    body.savedCard = savedCard;
  }
  const { data } = await axios.post(GATEWAY_API_URL, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.ni-payment.v2+json',
      Accept: 'application/vnd.ni-payment.v2+json',
      },
  });
  return data;
};

export const makePayment = async (accessToken, paymentUrl, body) => {
  const { data } = await axios.put(paymentUrl, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.ni-payment.v2+json',
      Accept: 'application/vnd.ni-payment.v2+json',
    },
  });
  return data;
};

export const getOrder = async (accessToken, orderId) => {
  const { data } = await axios.get(`${GATEWAY_API_URL}/${orderId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.ni-payment.v2+json',
      Accept: 'application/vnd.ni-payment.v2+json',
    },
  });
  return data;
};
