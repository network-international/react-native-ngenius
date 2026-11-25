const { createTokenizationClient } = require('../TokenizationClient');
const { cardContextFor } = require('../../cardContext');
const { TokenizationApiError } = require('../errors');

const args = { outletRef: 'fixture-outlet', sessionRef: 'fixture-session' };
const selection = { ...args, tokenRef: 'fixture-selected-token' };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const advance = async ms => { jest.advanceTimersByTime(ms); await flush(); };
const clientFor = options => createTokenizationClient({
  baseUrl: 'https://tokenization.invalid',
  getAccessToken: async () => 'fixture-private-access-token',
  ...options,
});
const observe = promise => {
  const settled = jest.fn();
  const result = promise.then(
    value => { settled('success'); return value; },
    error => { settled('error'); return error; },
  );
  return { settled, result };
};
const expectTimeout = error => {
  expect(error).toBeInstanceOf(TokenizationApiError);
  expect(error.toJSON()).toEqual({
    name: 'TokenizationApiError', status: 408, code: 'REQUEST_TIMEOUT',
    message: 'Tokenization request timed out', errors: [],
  });
  expect(JSON.stringify(error)).not.toMatch(/fixture-|private|Access-Token|tokenRef|sessionRef/);
};

let originalAbortController;
beforeEach(() => {
  originalAbortController = globalThis.AbortController;
  jest.useFakeTimers();
});
afterEach(() => {
  const timers = jest.getTimerCount();
  jest.clearAllTimers();
  jest.useRealTimers();
  globalThis.AbortController = originalAbortController;
  expect(timers).toBe(0);
});

it('times out a stalled Access-Token provider and never sends when it eventually resolves', async () => {
  const provider = deferred();
  const transport = jest.fn(async () => ({ status: 200, text: '{"tokens":[]}' }));
  const client = clientFor({ getAccessToken: jest.fn(() => provider.promise), transport });
  const observed = observe(client.getSession(args));
  await advance(29999);
  expect(observed.settled).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
  await advance(1);
  expectTimeout(await observed.result);
  provider.resolve('fixture-late-private-access-token');
  await flush();
  expect(observed.settled).toHaveBeenCalledTimes(1);
  expect(transport).not.toHaveBeenCalled();
});

it('shares one deadline across authorization and a custom transport that ignores abort', async () => {
  const provider = deferred();
  const response = deferred();
  const transport = jest.fn(() => response.promise);
  const getAccessToken = jest.fn(() => provider.promise);
  const client = clientFor({ getAccessToken, transport });
  const observed = observe(client.selectToken(selection));
  await advance(20000);
  provider.resolve('fixture-private-access-token');
  await flush();
  expect(transport).toHaveBeenCalledTimes(1);
  const { signal } = transport.mock.calls[0][0];
  expect(signal.aborted).toBe(false);
  await advance(9999);
  expect(observed.settled).not.toHaveBeenCalled();
  await advance(1);
  expectTimeout(await observed.result);
  expect(signal.aborted).toBe(true);
  response.resolve({ status: 204 });
  await advance(60000);
  expect(observed.settled.mock.calls).toEqual([['error']]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(getAccessToken).toHaveBeenCalledTimes(1);
});

it('aborts standard fetch and rejects on time even when fetch ignores its signal', async () => {
  const response = deferred();
  const fetchImpl = jest.fn(() => response.promise);
  const client = clientFor({ fetchImpl });
  const observed = observe(client.getSession(args));
  await flush();
  const signal = fetchImpl.mock.calls[0][1].signal;
  await advance(30000);
  expectTimeout(await observed.result);
  expect(signal.aborted).toBe(true);
  response.reject(new Error('private transport error after timeout'));
  await flush();
  expect(observed.settled).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('includes response-body reading in the original authorization-to-response deadline', async () => {
  const provider = deferred();
  const body = deferred();
  const readBody = jest.fn(() => body.promise);
  const fetchImpl = jest.fn(async () => ({ status: 200, text: readBody }));
  const client = clientFor({ getAccessToken: () => provider.promise, fetchImpl });
  const observed = observe(client.getSession(args));
  await advance(10000);
  provider.resolve('fixture-private-access-token');
  await flush();
  expect(readBody).toHaveBeenCalledTimes(1);
  await advance(19999);
  expect(observed.settled).not.toHaveBeenCalled();
  await advance(1);
  expectTimeout(await observed.result);
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  body.resolve('{"tokens":[]}');
  await flush();
  expect(observed.settled.mock.calls).toEqual([['error']]);
});

it('enforces the deadline without AbortController support', async () => {
  globalThis.AbortController = undefined;
  const transport = jest.fn(() => new Promise(() => {}));
  const observed = observe(clientFor({ transport }).getSession(args));
  await flush();
  expect(transport.mock.calls[0][0]).not.toHaveProperty('signal');
  await advance(30000);
  expectTimeout(await observed.result);
});

it('still reports the timeout if an abort implementation throws', async () => {
  const abort = jest.fn(() => { throw new Error('private abort failure'); });
  globalThis.AbortController = class { constructor() { this.signal = {}; this.abort = abort; } };
  const observed = observe(clientFor({ transport: () => new Promise(() => {}) }).getSession(args));
  await advance(30000);
  expectTimeout(await observed.result);
  expect(abort).toHaveBeenCalledTimes(1);
});

it.each([408, 504])('normalizes backend HTTP %s without waiting for or exposing its response body', async status => {
  const text = jest.fn(() => new Promise(() => {}));
  const fetchImpl = jest.fn(async () => ({ status, text }));
  const error = await clientFor({ fetchImpl }).getSession(args).catch(value => value);
  expectTimeout(error);
  expect(text).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each([408, 504])('preserves a clean timeout for selected-token HTTP %s', async status => {
  const transport = jest.fn(async () => ({
    status,
    get text() { throw new Error('private echoed fixture-session fixture-selected-token'); },
  }));
  expectTimeout(await clientFor({ transport }).selectToken(selection).catch(value => value));
  expect(transport).toHaveBeenCalledTimes(1);
});

it('sanitizes a custom transport timeout instead of leaking its error body', async () => {
  const transport = jest.fn(async () => { throw {
    status: 504, code: 'PRIVATE_UPSTREAM_ERROR', message: 'fixture-private-access-token',
    errors: [{ sessionRef: args.sessionRef, tokenRef: selection.tokenRef }],
  }; });
  expectTimeout(await clientFor({ transport }).selectToken(selection).catch(value => value));
});

it('bounds native Card credential preparation and discards a late provider result', async () => {
  const provider = deferred();
  const client = clientFor({ getAccessToken: () => provider.promise });
  const observed = observe(cardContextFor(client).prepareRequest(args));
  await advance(30000);
  expectTimeout(await observed.result);
  provider.resolve('fixture-private-access-token');
  await flush();
  expect(observed.settled.mock.calls).toEqual([['error']]);
});

it('cleans up a successful request without a later abort or automatic retry', async () => {
  const fetchImpl = jest.fn(async () => ({ status: 200, text: async () => '{"tokens":[]}' }));
  const client = clientFor({ fetchImpl });
  await expect(client.getSession(args)).resolves.toEqual({ tokens: [] });
  const { signal } = fetchImpl.mock.calls[0][1];
  expect(jest.getTimerCount()).toBe(0);
  await advance(60000);
  expect(signal.aborted).toBe(false);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('cleans up credential and network failures immediately without changing their existing error codes', async () => {
  const providerClient = clientFor({ getAccessToken: async () => { throw new Error('private provider failure'); } });
  await expect(providerClient.getSession(args)).rejects.toMatchObject({ code: 'ACCESS_TOKEN_UNAVAILABLE' });
  expect(jest.getTimerCount()).toBe(0);
  const transport = jest.fn(async () => { throw new Error('private network failure'); });
  await expect(clientFor({ transport }).getSession(args)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  expect(transport).toHaveBeenCalledTimes(1);
});
