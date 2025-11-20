import axios from 'axios';
import { Platform } from 'react-native';
import { getDeviceInfo, SDK_VERSION } from '@network-international/react-native-ngenius';
import {
  OUTLET_ID,
  API_KEY,
  IDENTITY_API_URL,
  GATEWAY_API_BASE_URL,
  PAYPAGE_API_URL,
  PAYPAGE_GATEWAY_URL,
} from './config';

// Cache for device info to avoid repeated native calls
let cachedDeviceInfo = null;

// Fallback SDK version if import fails
const FALLBACK_SDK_VERSION = '3.0.0';
const SDK_VER = SDK_VERSION || FALLBACK_SDK_VERSION;

// Helper function to generate User-Agent header
// Format matches payment-sdk-android: "React Native Pay Page {manufacturer}-{model} OS-{sdkVersion} SDK:{sdkVersion}"
// For iOS: "React Native Pay Page iOS SDK:{sdkVersion}" (device info not available on iOS)
const getUserAgent = async () => {
  try {
    if (!cachedDeviceInfo) {
      cachedDeviceInfo = await getDeviceInfo();
    }
    
    const { manufacturer, model, osVersion, platform } = cachedDeviceInfo;
    // osVersion is Android OS SDK version (e.g., 34 for Android 14), not our SDK version
    // SDK_VER is our React Native SDK version (e.g., 3.0.0)
    
    if (platform === 'android' && manufacturer !== 'unknown' && model !== 'unknown') {
      // Format: "React Native Pay Page samsung-SM-S928U OS-34 SDK:3.0.0"
      // OS-34 = Android OS SDK version, SDK:3.0.0 = our SDK version
      return `React Native Pay Page ${manufacturer}-${model} OS-${osVersion} SDK:${SDK_VER}`;
    } else if (platform === 'ios') {
      // iOS: device info not available from native module, use platform name
      return `React Native Pay Page iOS SDK:${SDK_VER}`;
    } else {
      // Fallback format if device info not available or platform unknown
      return `React Native Pay Page SDK:${SDK_VER}`;
    }
  } catch (err) {
    // Fallback if getDeviceInfo fails
    return `React Native Pay Page SDK:${SDK_VER}`;
  }
};

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
    const userAgent = await getUserAgent();
    const requestConfig = {
      method: 'post',
      url: IDENTITY_API_URL,
      headers: {
        Accept: 'application/vnd.ni-identity.v1+json',
        'Content-Type': 'application/vnd.ni-identity.v1+json',
        Authorization: `Basic ${API_KEY}`,
        'User-Agent': userAgent,
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
  const userAgent = await getUserAgent();
  const { data } = await axios.post(GATEWAY_API_URL, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.ni-payment.v2+json',
      Accept: 'application/vnd.ni-payment.v2+json',
      'User-Agent': userAgent,
    },
  });
  return data;
};

export const makePayment = async (accessToken, paymentUrl, body) => {
  // Use POST for Google Pay token payment (as per hosted-sessions-sdk pattern)
  const userAgent = await getUserAgent();
  const { data } = await axios.post(paymentUrl, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.ni-payment.v2+json',
      Accept: 'application/vnd.ni-payment.v2+json',
      'User-Agent': userAgent,
    },
  });
  return data;
};

export const acceptGooglePay = async (accessToken, googlePayAcceptUrl, token) => {
  // Use google-pay/accept endpoint as per payment-sdk-android pattern
  // Add ?isWebPayment=true parameter as implemented in payment-sdk-android:
  // payment-sdk-core/src/main/java/payment/sdk/android/core/interactor/GooglePayAcceptInteractor.kt
  // Line 11: val newUrl = "$url?isWebPayment=true"
  const url = googlePayAcceptUrl.includes('?') 
    ? `${googlePayAcceptUrl}&isWebPayment=true`
    : `${googlePayAcceptUrl}?isWebPayment=true`;
  
  // Token is a JSON string from Google Pay
  // In payment-sdk-android, it's passed as string in mapOf("token" to token)
  // JSONObject serializes it correctly as {"token":"json_string"}
  // The server expects the token as a STRING, not an object
  const requestBody = { token };
  
  const userAgent = await getUserAgent();
  
  // For paypage API, we may need Access-Token and Payment-Token headers
  // instead of or in addition to Authorization Bearer
  // Also add X-Forwarded-For as per paypage-app pattern
  const headers = {
    'Content-Type': 'application/vnd.ni-payment.v2+json',
    Accept: 'application/vnd.ni-payment.v2+json',
    'User-Agent': userAgent,
    'X-Forwarded-For': '1.1.1.1', // As per paypage-app pattern
  };
  
  // Try both Authorization Bearer and Access-Token/Payment-Token
  // paypage-app uses Access-Token and Payment-Token, but payment-sdk-android uses Authorization Bearer
  if (url.includes('paypage-dev.platform.network.ae')) {
    // PayPage API - use Access-Token and Payment-Token
    headers['Access-Token'] = accessToken;
    headers['Payment-Token'] = accessToken;
  } else {
    // Gateway API - use Authorization Bearer
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  try {
    const { data } = await axios.post(url, requestBody, {
      headers,
    });
    return data;
  } catch (err) {
    throw err;
  }
};

export const getOrder = async (accessToken, orderId) => {
  const userAgent = await getUserAgent();
  const { data } = await axios.get(`${GATEWAY_API_URL}/${orderId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.ni-payment.v2+json',
      Accept: 'application/vnd.ni-payment.v2+json',
      'User-Agent': userAgent,
    },
  });
  return data;
};

export const getGooglePayConfig = async (accessToken, orderResponse = null) => {
  try {
    // Extract outlet from token
    let outletIdFromToken = getOutletFromToken(accessToken);
    let outletId = outletIdFromToken || OUTLET_ID;
    
    // If order response is provided, try to use merchant reference as fallback
    // Sometimes the merchant reference is the correct outlet ID for Google Pay
    if (orderResponse?.merchantDetails?.reference && !outletIdFromToken) {
      outletId = orderResponse.merchantDetails.reference;
    }
    
    const url = `${PAYPAGE_API_URL}/api/outlets/${outletId}/google-pay/config`;
    const userAgent = await getUserAgent();
    const { data } = await axios.get(url, {
      headers: {
        hierarchyRef: outletId,
        'Payment-Token': accessToken,
        'Access-Token': accessToken,
        'User-Agent': userAgent,
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
