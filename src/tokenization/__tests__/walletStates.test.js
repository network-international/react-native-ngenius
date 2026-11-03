const { runWalletTokenization } = require('../walletTokenization');
const { skipped } = require('./fixtures/consent');
const { VERIFICATION_STATES } = require('../verificationStates');
it.each(['APPLE_PAY', 'GOOGLE_PAY'])('maps %s statuses and preserves the encrypted bytes', async (method) => {
  const payload = '{ "encrypted": true }\n';
  for (const [status, state] of [['VERIFIED', VERIFICATION_STATES.SUCCESS], ['AWAIT_3DS', VERIFICATION_STATES.AWAITING_3DS], ['FAILED', VERIFICATION_STATES.FAILED]]) {
    const client = { addWallet: jest.fn().mockResolvedValue({ status, type: 'WALLET', walletType: method, tokenRef: 'fixture-ref', cardDetails: { last4: '1234' } }) };
    const result = await runWalletTokenization({ method, client, outletRef: 'outlet', order: {}, captureWallet: async () => ({ token: payload }), consent: skipped() });
    expect(result.state).toBe(state);
    expect(result.result.niTokenCreated).toBe(status === 'VERIFIED');
    expect(client.addWallet.mock.calls[0][0].encryptedPayload).toBe(payload);
  }
});
it('does not launch a deferred wallet belonging to a closed session', async () => {
  const captureWallet = jest.fn();
  const client = { addWallet: jest.fn() };
  await runWalletTokenization({ client, captureWallet, isCurrent: () => false });
  expect(captureWallet).not.toHaveBeenCalled();
  expect(client.addWallet).not.toHaveBeenCalled();
});
