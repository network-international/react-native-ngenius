const SENSITIVE_KEY =
  /^(pan|cvv|dan|onlinePaymentCryptogram|cryptogram|message|accessToken|apiKey|authorization|x-api-key|token|password|jwt)$/i;

const redactValue = (key, value) => {
  if (SENSITIVE_KEY.test(key)) {
    return '[REDACTED]';
  }
  return redactSensitive(value);
};

const redactSensitive = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      out[key] = redactValue(key, value[key]);
    });
    return out;
  }
  return value;
};

const safeErrorText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value;
};

module.exports = {
  SENSITIVE_KEY,
  redactSensitive,
  safeErrorText,
};
