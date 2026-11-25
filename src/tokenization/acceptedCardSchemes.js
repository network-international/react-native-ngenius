const SCHEME_NAMES = {
  VISA: 'Visa',
  MASTERCARD: 'Mastercard',
  MC: 'Mastercard',
  AMEX: 'American Express',
  AMERICANEXPRESS: 'American Express',
  DISCOVER: 'Discover',
  JCB: 'JCB',
  DINERS: 'Diners Club',
  DINERSCLUB: 'Diners Club',
  DINERSCLUBINTERNATIONAL: 'Diners Club',
  CUP: 'UnionPay',
  CHINAUNIONPAY: 'UnionPay',
  UNIONPAY: 'UnionPay',
  MADA: 'mada',
  JAYWAN: 'Jaywan',
  MAESTRO: 'Maestro',
};

const acceptedCardSchemes = schemes => Array.isArray(schemes)
  ? [...new Set(schemes
    .filter(scheme => typeof scheme === 'string')
    .map(scheme => SCHEME_NAMES[scheme.toUpperCase().replace(/[^A-Z]/g, '')])
    .filter(Boolean))]
  : [];

module.exports = { acceptedCardSchemes };
