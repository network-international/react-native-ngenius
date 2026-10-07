const { redactSensitive } = require('./redact');
const { readHeader, HEADER_CORRELATION_ID } = require('./headers');

class TokenizationApiError extends Error {
  constructor({
    status,
    code,
    message,
    correlationId,
  }) {
    super(typeof message === 'string' && message.length > 0 ? message : 'Request failed');
    this.name = 'TokenizationApiError';
    this.status = typeof status === 'number' ? status : 0;
    this.code = typeof code === 'string' && code.length > 0 ? code : 'UNKNOWN_ERROR';
    this.correlationId =
      typeof correlationId === 'string' && correlationId.length > 0
        ? correlationId
        : undefined;
  }

  toJSON() {
    return {
      name: this.name,
      status: this.status,
      code: this.code,
      message: this.message,
      correlationId: this.correlationId,
    };
  }
}

const HTTP_ERROR_FALLBACK = {
  400: { code: 'INVALID_REQUEST', message: 'Invalid request' },
  401: { code: 'UNAUTHORIZED', message: 'Authentication failed' },
  403: { code: 'FORBIDDEN', message: 'Caller is not authorized' },
  404: { code: 'PAYMENT_METHOD_NOT_FOUND', message: 'Payment method was not found' },
  409: {
    code: 'DUPLICATE_IDEMPOTENCY_KEY',
    message: 'A request with this Idempotency-Key is currently being processed or already succeeded',
  },
  422: { code: 'VERIFICATION_FAILED', message: 'Verification failed' },
  500: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
  502: { code: 'DEPENDENCY_ERROR', message: 'Downstream dependency failure' },
};

const parseErrorResponseBody = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const code = typeof value.code === 'string' ? value.code : undefined;
  const message = typeof value.message === 'string' ? value.message : undefined;
  const correlationId =
    typeof value.correlationId === 'string' ? value.correlationId : undefined;
  if (!code && !message && !correlationId) {
    return null;
  }
  return { code, message, correlationId };
};

const errorFromResponse = ({ status, headers, body }) => {
  const parsed = parseErrorResponseBody(body);
  const fallback = HTTP_ERROR_FALLBACK[status] || {
    code: 'UNKNOWN_ERROR',
    message: 'Request failed',
  };
  const correlationId =
    (parsed && parsed.correlationId) ||
    readHeader(headers, HEADER_CORRELATION_ID);
  return new TokenizationApiError({
    status,
    code: (parsed && parsed.code) || fallback.code,
    message: (parsed && parsed.message) || fallback.message,
    correlationId,
  });
};

const errorFromMalformedResponse = ({ status, headers, text }) => {
  const correlationId = readHeader(headers, HEADER_CORRELATION_ID);
  const error = new TokenizationApiError({
    status,
    code: 'MALFORMED_RESPONSE',
    message: 'Response was not valid JSON',
    correlationId,
  });
  void text;
  return error;
};

const assertNoSensitiveLeak = (error) => {
  const serialized = JSON.stringify(redactSensitive(error.toJSON()));
  return serialized;
};

module.exports = {
  TokenizationApiError,
  HTTP_ERROR_FALLBACK,
  parseErrorResponseBody,
  errorFromResponse,
  errorFromMalformedResponse,
  assertNoSensitiveLeak,
};
