const createFetchTransport = (fetchImpl) => {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is not available; supply a transport to createTokenizationClient');
  }
  return async ({ url, method, headers, body }) => {
    const init = {
      method,
      headers,
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await fetchFn(url, init);
    const text = await response.text();
    return {
      status: response.status,
      text,
    };
  };
};

const parseJsonBody = (text) => {
  if (text == null || text === '') {
    return { ok: true, body: undefined };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch (error) {
    return { ok: false, body: undefined };
  }
};

module.exports = {
  createFetchTransport,
  parseJsonBody,
};
