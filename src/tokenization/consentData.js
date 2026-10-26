// Internal intent, not a backend wire schema. No device data or client audit time.
const buildConsentData = ({ skipConsent = false, accepted = false } = {}) => {
  if (skipConsent === true) {
    return Object.freeze({ status: 'NOT_COLLECTED', skippedByMerchant: true });
  }
  if (accepted !== true) throw new Error('Consent acceptance is required');
  return Object.freeze({ status: 'COLLECTED' });
};

// A confirmed serializer can be installed here once Hossam supplies the contract.
// Production deliberately preserves the deployed body. Tests may inject a mock.
const mapConsentRequest = ({ tokenData, consent, serialize }) => {
  if (!consent || !['COLLECTED', 'NOT_COLLECTED'].includes(consent.status)) {
    throw new Error('Consent intent is required');
  }
  return serialize ? serialize({ tokenData, consent }) : tokenData;
};

module.exports = { buildConsentData, mapConsentRequest };
