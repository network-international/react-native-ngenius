const { buildConsentData, mapConsentRequest } = require('../consentData');

describe('internal consent intent and isolated serialization', () => {
  it('requires explicit acceptance and builds COLLECTED without inventing audit fields', () => {
    expect(() => buildConsentData()).toThrow('acceptance');
    expect(buildConsentData({ accepted: true })).toEqual({ status: 'COLLECTED' });
  });

  it('records merchant-selected skipping internally', () => {
    expect(buildConsentData({ skipConsent: true })).toEqual({ status: 'NOT_COLLECTED', skippedByMerchant: true });
    expect(() => buildConsentData({ skipConsent: 'true' })).toThrow('acceptance');
  });

  it('drops all device, credential and client timestamp inputs', () => {
    const intent = buildConsentData({ accepted: true, device: { pan: 'secret', id: 'private' }, accessToken: 'secret', dateTime: 'client-time' });
    expect(intent).toEqual({ status: 'COLLECTED' });
    expect(Object.isFrozen(intent)).toBe(true);
  });

  it.each([{ accepted: true }, { skipConsent: true }])('preserves live requests and allows mock serialization for %p', (state) => {
    const tokenData = { walletType: 'GOOGLE_PAY', encryptedPayload: 'opaque' };
    const consent = buildConsentData(state);
    expect(mapConsentRequest({ tokenData, consent })).toBe(tokenData);
    // This deliberately synthetic envelope is a mock, not a proposed backend schema.
    const serialize = jest.fn((input) => ({ mockToken: input.tokenData, mockConsent: input.consent }));
    expect(mapConsentRequest({ tokenData, consent, serialize })).toEqual({ mockToken: tokenData, mockConsent: consent });
    expect(serialize).toHaveBeenCalledWith({ tokenData, consent });
  });
});
