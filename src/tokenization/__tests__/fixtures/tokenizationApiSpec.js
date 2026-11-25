// Response examples from the Tokenization API Specification (Confluence page 5230821378,
// version 28). Documentation examples, not captured UAT responses. The example tncUrl
// has a stray "<" in the document; it is written here as a valid URL.
const savedVisa = Object.freeze({
  tokenRef: '019a8f3c-6d2e-7b41-9c5a-3e8d1f2a4b6c',
  type: 'CARD',
  status: 'VERIFIED',
  usageType: 'PERMANENT',
  authType: 'NON_AUTHENTICATED',
  consentStatus: 'COLLECTED',
  cardDetails: { scheme: 'VISA', last4: '1111', expiry: '2030-12', cardholderName: 'John Doe' },
});

const getSessionResponse = Object.freeze({
  advisedTokens: [savedVisa],
  tncUrl: 'https://example.com/terms-and-conditions',
  paymentMethods: { card: ['VISA', 'MASTERCARD'], wallet: ['GOOGLE_PAY'] },
  orderDetails: {
    action: 'SALE',
    amount: { currencyCode: 'AED', value: 10025 },
    orderSummary: {
      items: [{
        description: 'Test product',
        totalPrice: { currencyCode: 'AED', value: 10025 },
        quantity: 1,
        category: 'Retail',
      }],
      shipping: { currencyCode: 'AED', value: 0 },
      tax: { currencyCode: 'AED', value: 0 },
      total: { currencyCode: 'AED', value: 10025 },
    },
  },
  isMcpSelected: false,
});

const addCardResponse = Object.freeze({
  advisedTokens: [
    {
      tokenRef: '019a9a25-7e8f-7a90-8b1c-2d3e4f5a6b7c',
      type: 'CARD',
      status: 'VERIFIED',
      usageType: 'PERMANENT',
      authType: 'NON_AUTHENTICATED',
      consentStatus: 'COLLECTED',
      cardDetails: { scheme: 'VISA', last4: '1111', expiry: '2030-12', cardholderName: 'John Doe' },
    },
    {
      tokenRef: '019a8f3c-6d2e-7b41-9c5a-3e8d1f2a4b6c',
      type: 'CARD',
      status: 'VERIFIED',
      usageType: 'PERMANENT',
      authType: 'NON_AUTHENTICATED',
      consentStatus: 'COLLECTED',
      cardDetails: { scheme: 'MASTERCARD', last4: '4444', expiry: '2029-06', cardholderName: 'John Doe' },
    },
  ],
});

const selectTokenResponse = savedVisa;

module.exports = { getSessionResponse, addCardResponse, selectTokenResponse };
