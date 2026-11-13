const { buildConsentData } = require('../../consentData');
const inputs = { platform: 'android', osVersion: 35, screen: { width: 412, height: 915 }, timezoneOffsetMinutes: -240,
  now: () => new Date('2026-10-26T06:15:30.000Z') };
const skipped = () => buildConsentData({ ...inputs, skipConsent: true });
const collected = () => buildConsentData({ ...inputs, accepted: true, acceptedAt: '2026-10-26T06:15:30.000Z', language: 'fr', tncUrl: 'https://merchant.example/terms' });
module.exports = { inputs, skipped, collected };
