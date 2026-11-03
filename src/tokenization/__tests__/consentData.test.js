const { buildConsentData, serializeConsentData, mapConsentRequest } = require('../consentData');
const { SDK_VERSION } = require('../../version');
const { inputs, skipped, collected } = require('./fixtures/consent');
it('implements Hossam’s exact NOT_COLLECTED contract', () => {
  expect(skipped()).toEqual({ status: 'NOT_COLLECTED', merchantSelectedSkipConsent: true, clientTimestamp: '2026-10-26T06:15:30.000Z',
    channel: 'REACT_NATIVE', sdk: { name: 'react-native-ngenius', version: SDK_VERSION },
    device: { platform: 'ANDROID', osVersion: '35', timezoneOffsetMinutes: -240, screenWidth: 412, screenHeight: 915 } });
});
it('implements COLLECTED with the acceptance time, exact displayed terms URL and normalized locale', () => {
  const output = buildConsentData({ ...inputs, accepted: true, acceptedAt: '2026-10-20T01:02:03.000Z', language: 'FR-ca', tncUrl: 'https://merchant.example/terms' });
  expect(output).toEqual({ status: 'COLLECTED', clientTimestamp: '2026-10-20T01:02:03.000Z',
    tncUrl: 'https://merchant.example/terms', locale: 'fr', channel: 'REACT_NATIVE',
    sdk: { name: 'react-native-ngenius', version: SDK_VERSION },
    device: { platform: 'ANDROID', osVersion: '35', timezoneOffsetMinutes: -240, screenWidth: 412, screenHeight: 915 } });
});
it('omits locale and terms for skipped consent regardless of merchant inputs', () => {
  const result = buildConsentData({ ...inputs, skipConsent: true, language: 'ar', tncUrl: 'https://merchant.example/terms' });
  expect(result).not.toHaveProperty('locale'); expect(result).not.toHaveProperty('tncUrl');
});
it.each([undefined, 'data:text/plain,terms', 'javascript:alert(1)'])('omits unavailable/unsafe terms %p', tncUrl => {
  expect(buildConsentData({ ...inputs, accepted: true, acceptedAt: '2026-10-26T06:15:30.000Z', tncUrl })).not.toHaveProperty('tncUrl');
});
it.each([undefined, '', 'invalid', '2026-10-26T06:15:30+00:00'])('rejects collected consent without a canonical acceptance timestamp %p', acceptedAt => {
  expect(() => buildConsentData({ ...inputs, accepted: true, acceptedAt })).toThrow('timestamp');
});
it('requires acceptance unless the boolean skip prop is true', () => {
  expect(() => buildConsentData({ ...inputs })).toThrow('acceptance');
  expect(() => buildConsentData({ ...inputs, skipConsent: 'true' })).toThrow('acceptance');
});
it.each([['ios', '26.5', 'IOS'], ['android', 35, 'ANDROID']])('normalizes device metadata for %s without identifiers', (platform, osVersion, expected) => {
  const value = buildConsentData({ ...inputs, platform, osVersion, skipConsent: true });
  expect(value.device.platform).toBe(expected); expect(value.device.osVersion).toBe(String(osVersion));
  expect(Object.keys(value.device).sort()).toEqual(['osVersion', 'platform', 'screenHeight', 'screenWidth', 'timezoneOffsetMinutes']);
});
it.each([NaN, Infinity, -1, '412', undefined])('omits non-finite/non-numeric dimensions %p', width => {
  expect(buildConsentData({ ...inputs, skipConsent: true, screen: { width, height: 915 } }).device).not.toHaveProperty('screenWidth');
});
it('allowlists nested fields, preserves timestamps and never mutates inputs', () => {
  const original = { ...collected(), clientIp: 'private', forwardedForIp: 'private', serverTimestamp: 'private', browserIP: 'private',
    browserAcceptHeader: 'private', challengeWindowSize: 'private', consentTextHash: 'private',
    device: { ...collected().device, model: 'private', identifier: 'private' } };
  const before = JSON.stringify(original); const output = serializeConsentData(original);
  expect(output).toEqual(collected()); expect(JSON.stringify(original)).toBe(before);
  expect(JSON.stringify(output)).not.toContain('private'); expect(Object.isFrozen(output)).toBe(true);
});
it('adds consent beside the wallet payload without changing opaque encrypted bytes', () => {
  const encryptedPayload = '{ "encrypted": true }\n';
  expect(mapConsentRequest({ tokenData: { encryptedPayload }, consent: skipped() })).toEqual({ encryptedPayload, consentData: skipped() });
});
