const { HEADER_CORRELATION_ID, readHeader } = require('./headers');
const { redactSensitive } = require('./redact');

const headerMapFromFetch = (headers) => {
  const out = {};
  if (!headers) {
    return out;
  }
  if (typeof headers.forEach === 'function') {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  Object.keys(headers).forEach((key) => {
    out[key] = headers[key];
  });
  return out;
};

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
      headers: headerMapFromFetch(response.headers),
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

const describeTransportCall = ({ method, url, headers }) =>
  redactSensitive({
    method,
    url,
    headers,
  });

const correlationFromTransport = (headers) =>
  readHeader(headers, HEADER_CORRELATION_ID);

module.exports = {
  createFetchTransport,
  parseJsonBody,
  describeTransportCall,
  correlationFromTransport,
};
