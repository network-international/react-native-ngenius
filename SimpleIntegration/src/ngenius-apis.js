import axios from 'axios';

const REALM = 'ni'; // add your realm
const OUTLET_ID = ''; // add your outletId
const API_KEY = ''; // add your api key
const IDENTITY_API_URL =
  'https://api-gateway-dev.ngenius-payments.com/identity/auth/access-token';
const GATEWAY_API_URL =
  `https://api-gateway-dev.ngenius-payments.com/transactions/outlets/${OUTLET_ID}/orders`;

export const createToken = async () => {
  try {
    const { data } = await axios({
      method: 'post',
      url: IDENTITY_API_URL,
      headers: {
        'Content-Type': 'application/vnd.ni-identity.v1+json',
        Authorization: `Basic ${API_KEY}`,
      },
      data: {
        grant_type: 'client_credentials',
        realm: REALM,
      },
    });
    const { access_token } = data;
    return access_token;
  } catch (err) {
    return err;
  }
};

export const createOrder = async (accessToken, amount) => {
  try {
    const { data } = await axios.post(
      GATEWAY_API_URL,
      {
        action: 'SALE',
        amount: {
          currencyCode: 'AED',
          value: amount,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/vnd.ni-payment.v2+json',
          Accept: 'application/vnd.ni-payment.v2+json',
        },
      },
    );
    return data;
  } catch (err) {
    console.log(err);
    return err;
  }
};
