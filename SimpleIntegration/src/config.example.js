// Public sandbox defaults. Credentials must never be embedded in QA builds.
export const OUTLET_ID = '';
export const API_KEY = '';
export const REALM = 'ni';
export const IDENTITY_API_URL =
  'https://api-gateway.sandbox.ngenius-payments.com/identity/auth/access-token';
export const GATEWAY_API_BASE_URL =
  'https://api-gateway.sandbox.ngenius-payments.com';
export const CREATE_ORDER_URL = `${GATEWAY_API_BASE_URL}/transactions/outlets/${OUTLET_ID}/orders`;
export const PAYPAGE_API_URL = 'https://paypage.sandbox.ngenius-payments.com';
export const PAYPAGE_GATEWAY_URL = `${GATEWAY_API_BASE_URL}/transactions`;
