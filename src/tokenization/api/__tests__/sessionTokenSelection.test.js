const { createTokenizationClient, ACCESS_TOKEN_UNAVAILABLE } = require('../TokenizationClient');
const { TokenizationApiError } = require('../errors');

const BASE_URL = 'https://tokenization.test';
const tokenRef = '8a880dc0-d2d2-4067-bcb1-b08d1690b26e';
const args = { outletRef: 'outlet-1', sessionRef: 'session-1', tokenRef };

const setup = ({ response = { status: 200, text: '' }, getAccessToken, transport } = {}) => {
  const provider = getAccessToken || jest.fn(async () => 'fixture-access-token');
  const send = transport || jest.fn(async () => response);
  const client = createTokenizationClient({
    baseUrl: BASE_URL,
    getAccessToken: provider,
    transport: send,
  });
  return { client, provider, send };
};

describe('session token selection', () => {
  it('PUTs only tokenRef to the supplied session path, with just-in-time Access-Token', async () => {
    let tokenNumber = 0;
    const provider = jest.fn(async () => `fixture-access-${++tokenNumber}`);
    const { client, send } = setup({ getAccessToken: provider });
    await expect(client.selectToken({
      ...args,
      outletRef: 'outlet 1/a',
      selectedCard: 'obsolete-field',
      cardDetails: { last4: '1111' },
      merchantData: 'omit',
    })).resolves.toEqual({ status: 'SELECTED' });
    await client.selectToken(args);
    expect(send.mock.calls[0][0]).toEqual({
      url: `${BASE_URL}/api/outlets/outlet%201%2Fa/payment-tokenization-sessions/session-1/selected-token`,
      method: 'PUT',
      headers: { 'Access-Token': 'fixture-access-1', 'Content-Type': 'application/json' },
      body: { tokenRef },
      responseMode: 'status-only',
    });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].headers['Access-Token']).toBe('fixture-access-2');
    expect(Object.keys(send.mock.calls[0][0].body)).toEqual(['tokenRef']);
  });

  it.each(['', '<html>ignored</html>', JSON.stringify({ tokenRef, cardDetails: 'private-echo' })])
    ('returns status only for HTTP200 without interpreting the response body (%#)', async text => {
      const { client } = setup({ response: { status: 200, text } });
      await expect(client.selectToken(args)).resolves.toEqual({ status: 'SELECTED' });
    });

  it('does not access a response body to confirm selection', async () => {
    const response = { status: 200, get text() { throw new Error('body must not be read'); } };
    const { client } = setup({ response });
    await expect(client.selectToken(args)).resolves.toEqual({ status: 'SELECTED' });
  });

  it.each([201, 202, 299, 300, 400, 401, 403, 404, 409, 422, 500, 502])
    ('rejects HTTP%s with a generic structured error and no response echo', async status => {
      const response = { status, get text() { throw new Error(`private ${tokenRef}`); } };
      const { client } = setup({ response });
      const error = await client.selectToken(args).catch(value => value);
      expect(error).toBeInstanceOf(TokenizationApiError);
      expect(error.toJSON()).toEqual({
        name: 'TokenizationApiError', status,
        code: 'SESSION_SELECTION_FAILED',
        message: 'Payment method selection could not be saved', errors: [],
      });
      expect(JSON.stringify(error)).not.toContain(tokenRef);
    });

  it.each([null, undefined, {}, { status: '200' }])('rejects a missing or invalid HTTPstatus (%#)', async response => {
    const { client } = setup({ transport: jest.fn(async () => response) });
    await expect(client.selectToken(args)).rejects.toMatchObject({ status: 0, code: 'SESSION_SELECTION_FAILED' });
  });

  it.each([undefined, null, '', 'tok/1', `${tokenRef}\n`, {}, [tokenRef]])
    ('rejects a invalid tokenRef before authorization or transport (%#)', async value => {
      const { client, provider, send } = setup();
      const error = await client.selectToken({ ...args, tokenRef: value }).catch(result => result);
      expect(error).toMatchObject({ status: 0, code: 'INVALID_TOKEN_REF' });
      expect(JSON.stringify(error)).not.toContain(tokenRef);
      expect(provider).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

  it('accepts opaque token references and an empty HTTP 204', async () => {
    const { client, send } = setup({ response: { status: 204 } });
    await expect(client.selectToken({ ...args, tokenRef: 'tok_1' })).resolves.toEqual({ status: 'SELECTED' });
    expect(send.mock.calls[0][0].body).toEqual({ tokenRef: 'tok_1' });
  });

  it('rejects a duplicate submit for the same session while the first request is in flight', async () => {
    let complete;
    const pending = new Promise(resolve => { complete = resolve; });
    const { client, send, provider } = setup({ transport: jest.fn(() => pending) });
    const selection = client.selectToken(args);
    await expect(client.selectToken(args)).rejects.toMatchObject({ code: 'SESSION_SELECTION_IN_PROGRESS' });
    await expect(client.selectToken({ ...args, tokenRef: 'another-token' })).rejects.toMatchObject({
      code: 'SESSION_SELECTION_IN_PROGRESS',
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    complete({ status: 200 });
    await selection;
    await expect(client.selectToken(args)).resolves.toEqual({ status: 'SELECTED' });
  });

  it.each([
    { ...args, outletRef: '' },
    { ...args, sessionRef: undefined },
    { ...args, sessionRef: '../other-session' },
    { ...args, sessionRef: 'session?query=unexpected' },
    { ...args, sessionRef: 'session-1\n' },
  ])('validates path identifiers before authorization or transport (%#)', async input => {
    const { client, provider, send } = setup();
    await expect(client.selectToken(input)).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send a request when the Access-Token provider fails', async () => {
    const { client, send } = setup({ getAccessToken: jest.fn(async () => { throw new Error('private-auth'); }) });
    const error = await client.selectToken(args).catch(value => value);
    expect(error).toMatchObject({ status: 0, code: ACCESS_TOKEN_UNAVAILABLE });
    expect(JSON.stringify(error)).not.toMatch(/private-auth|8a880dc0/);
    expect(send).not.toHaveBeenCalled();
  });

  it('maps a rejected transport safely and never logs tokenRef or payloads', async () => {
    const spies = ['log', 'info', 'warn', 'error'].map(key => jest.spyOn(console, key).mockImplementation(() => {}));
    try {
      const { client } = setup({ transport: jest.fn(async () => { throw new Error(`private ${tokenRef}`); }) });
      const error = await client.selectToken(args).catch(value => value);
      expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
      expect(JSON.stringify(error)).not.toMatch(/private|8a880dc0/);
      spies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });

  it('serializes the same PUT contract through the standard fetch transport', async () => {
    const readBody = jest.fn(async () => { throw new Error('response body is unavailable'); });
    const fetchImpl = jest.fn(async () => ({ status: 200, text: readBody }));
    const client = createTokenizationClient({
      baseUrl: `${BASE_URL}/`, getAccessToken: async () => 'fixture-access',
      fetchImpl,
    });
    await expect(client.selectToken(args)).resolves.toEqual({ status: 'SELECTED' });
    expect(readBody).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE_URL}/api/outlets/outlet-1/payment-tokenization-sessions/session-1/selected-token`, {
      method: 'PUT', headers: { 'Access-Token': 'fixture-access', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenRef }),
    });
  });
});
