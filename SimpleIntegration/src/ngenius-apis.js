import axios from 'axios';
import {
  OUTLET_ID,
  API_KEY,
  IDENTITY_API_URL,
  GATEWAY_API_BASE_URL,
  PAYPAGE_API_URL,
  PAYPAGE_GATEWAY_URL,
} from './config';

// Helper function to decode base64 (React Native compatible)
const base64Decode = (str) => {
  // React Native doesn't have atob, so we use Buffer or manual decoding
  try {
    // Try using Buffer if available
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64').toString('utf-8');
    }
    // Fallback: manual base64 decoding
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    str = str.replace(/[^A-Za-z0-9+/=]/g, '');
    for (let i = 0; i < str.length; ) {
      const enc1 = chars.indexOf(str.charAt(i++));
      const enc2 = chars.indexOf(str.charAt(i++));
      const enc3 = chars.indexOf(str.charAt(i++));
      const enc4 = chars.indexOf(str.charAt(i++));
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      output += String.fromCharCode(chr1);
      if (enc3 !== 64) output += String.fromCharCode(chr2);
      if (enc4 !== 64) output += String.fromCharCode(chr3);
    }
    return output;
  } catch (err) {
    throw new Error('Failed to decode base64: ' + err.message);
  }
};

// Helper function to decode JWT and extract hierarchyRefs
export const getOutletFromToken = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = base64Decode(base64);
    const payload = JSON.parse(jsonPayload);
    return payload.hierarchyRefs?.[0] || null;
  } catch (err) {
    return null;
  }
};

const GATEWAY_API_URL = `${GATEWAY_API_BASE_URL}/transactions/outlets/${OUTLET_ID}/orders`;

export const createToken = async () => {
  try {
    const requestConfig = {
      method: 'post',
      url: IDENTITY_API_URL,
      headers: {
        Accept: 'application/vnd.ni-identity.v1+json',
        'Content-Type': 'application/vnd.ni-identity.v1+json',
        Authorization: `Basic ${API_KEY}`,
      },
      data: {
        grantType: 'client_credentials',
        realmName: 'newPayPageNoThreeDS',
      },
    };
    
    const { data } = await axios(requestConfig);
    
    if (!data || !data.access_token) {
      throw new Error('No access token in response');
    }
    
    return data.access_token;
  } catch (err) {
    throw err;
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
  // Use POST for Google Pay token payment (as per hosted-sessions-sdk pattern)
  const { data } = await axios.post(paymentUrl, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.ni-payment.v2+json',
      Accept: 'application/vnd.ni-payment.v2+json',
    },
  });
  return data;
};

export const acceptGooglePay = async (accessToken, googlePayAcceptUrl, token) => {
  // Use google-pay/accept endpoint as per payment-sdk-android pattern
  // Add ?isWebPayment=true parameter as per GooglePayAcceptInteractor
  const url = googlePayAcceptUrl.includes('?') 
    ? `${googlePayAcceptUrl}&isWebPayment=true`
    : `${googlePayAcceptUrl}?isWebPayment=true`;
  
  // Token is a JSON string from Google Pay
  // In payment-sdk-android, it's passed as string in mapOf("token" to token)
  // JSONObject serializes it correctly as {"token":"json_string"}
  // The server expects the token as a STRING, not an object
  const requestBody = { token };
  
  const { data } = await axios.post(url, requestBody, {
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

export const getGooglePayConfig = async (accessToken) => {
  try {
    // Extract outlet from token
    const outletIdFromToken = getOutletFromToken(accessToken);
    const outletId = outletIdFromToken || OUTLET_ID;
    const url = `${PAYPAGE_API_URL}/api/outlets/${outletId}/google-pay/config`;
    const { data } = await axios.get(url, {
      headers: {
        hierarchyRef: outletId,
        'Payment-Token': accessToken,
        'Access-Token': accessToken,
      },
    });
    return data;
  } catch (err) {
    // Return fallback config if API call fails
    const outletIdFromToken = getOutletFromToken(accessToken);
    return {
      allowedPaymentMethods: ['VISA', 'MASTERCARD'],
      allowedAuthMethods: ['CRYPTOGRAM_3DS', 'PAN_ONLY'],
      gatewayName: 'networkintl',
      environment: 'TEST',
      merchantInfo: {
        reference: outletIdFromToken || OUTLET_ID,
        name: 'Apple Pay Chub',
      },
      merchantGatewayId: 'BCR2DN4T263KB4BO',
      merchantOrigin: 'http://applePayChub.com',
    };
  }
};
