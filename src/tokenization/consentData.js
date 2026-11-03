// Internal intent, not a backend wire schema. No device data or client audit time.
const buildConsentData = ({ skipConsent = false, accepted = false } = {}) => {
  if (skipConsent === true) {
    return Object.freeze({ status: 'NOT_COLLECTED', skippedByMerchant: true });
  }
  if (accepted !== true) throw new Error('Consent acceptance is required');
  return Object.freeze({ status: 'COLLECTED' });
};

// A confirmed serializer can be installed here once Hossam supplies the contract.
// Until that contract is supplied, UI mutations stop before native capture.
// Tests can inject a deliberately synthetic serializer; it is never a live schema.
const mapConsentRequest = ({ tokenData, consent, serialize }) => {
  if (!consent || !['COLLECTED', 'NOT_COLLECTED'].includes(consent.status)) {
    throw new Error('Consent intent is required');
  }
  if (!serialize) {
    const error = new Error('The confirmed consent request contract is not available');
    error.code = 'CONSENT_CONTRACT_UNAVAILABLE';
    throw error;
  }
  return serialize({ tokenData, consent });
};

module.exports = { buildConsentData, mapConsentRequest };
