const { createTokenizationClient } = require('../TokenizationClient');
it('places caller-supplied consentData only in the wallet body and keeps encrypted data unchanged', async () => {
  const calls = [];
  const payload = '{ "opaque": "wallet bytes" }\n';
  // Hossam-confirmed client metadata; the encrypted wallet string stays opaque.
  const consentData = require('../../__tests__/fixtures/consent').skipped();
  const client = createTokenizationClient({ baseUrl: 'https://sandbox.test', getAccessToken: async () => 'fixture-access', transport: async request => {
    calls.push(request);
    return { status: 200, text: JSON.stringify({ tokenRef: 'fixture', type: 'WALLET', walletType: 'APPLE_PAY', status: 'AWAIT_3DS' }) };
  } });
  await expect(client.addWallet({ outletRef: 'outlet', walletType: 'APPLE_PAY', encryptedPayload: payload, consentData })).resolves.toMatchObject({ status: 'AWAIT_3DS' });
  expect(calls[0].body).toEqual({ walletType: 'APPLE_PAY', encryptedPayload: payload, consentData });
  expect(calls[0].headers).toEqual({ 'Access-Token': 'fixture-access', 'Content-Type': 'application/json' });
  expect(calls[0].url).toBe('https://sandbox.test/api/outlets/outlet/wallets');
});
