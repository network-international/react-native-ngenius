const { runWalletTokenization } = require('../walletTokenization');
const { buildConsentData } = require('../consentData');
const { createTokenizationClient } = require('../api/TokenizationClient');
const { inputs } = require('./fixtures/consent');
it.each(['APPLE_PAY', 'GOOGLE_PAY'])('sends confirmed collected/skipped consent in the real %s client pipeline', async method => {
  for (const skipConsent of [true, false]) {
    const calls = []; const payload = '{ "opaque": "encrypted bytes" }\n';
    let now = new Date('2026-10-26T06:15:30.000Z');
    const acceptedAt = now.toISOString();
    const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken: async () => 'fixture',
      transport: async request => { calls.push(request); return { status: 200, text: JSON.stringify({ type: 'WALLET', walletType: method, tokenRef: 'fixture', status: 'VERIFIED', cardDetails: { scheme: 'VISA', last4: '1111', expiry: '2099-12' } }) }; } });
    const outcome = await runWalletTokenization({ method, client, outletRef: 'outlet', order: {},
      captureWallet: async () => { now = new Date('2026-10-26T06:17:30.000Z'); return { token: payload }; },
      getConsentData: () => buildConsentData({ ...inputs, skipConsent, accepted: !skipConsent, acceptedAt,
        language: 'ar', tncUrl: 'https://merchant.example/terms', now: () => now }) });
    expect(outcome.result.niTokenCreated).toBe(true);
    expect(calls[0].body.encryptedPayload).toBe(payload);
    expect(calls[0].body.consentData).toMatchObject({ status: skipConsent ? 'NOT_COLLECTED' : 'COLLECTED',
      clientTimestamp: skipConsent ? '2026-10-26T06:17:30.000Z' : acceptedAt, channel: 'REACT_NATIVE' });
    if (skipConsent) { expect(calls[0].body.consentData.merchantSelectedSkipConsent).toBe(true); expect(calls[0].body.consentData).not.toHaveProperty('locale'); }
    else { expect(calls[0].body.consentData.locale).toBe('ar'); expect(calls[0].body.consentData.tncUrl).toBe('https://merchant.example/terms'); }
    expect(calls[0].url).toBe('https://sandbox.test/api/outlets/outlet/wallets');
    expect(calls[0].headers).toEqual({ 'Access-Token': 'fixture', 'Content-Type': 'application/json' });
  }
});
