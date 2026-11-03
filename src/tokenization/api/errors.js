class TokenizationApiError extends Error {
  constructor({ status, code, message, errors }) {
    super(typeof message === 'string' && message.length > 0 ? message : 'Request failed');
    this.name = 'TokenizationApiError';
    this.status = typeof status === 'number' ? status : 0;
    this.code = typeof code === 'string' && code.length > 0 ? code : 'UNKNOWN_ERROR';
    this.errors = Array.isArray(errors) ? errors : [];
  }

  toJSON() {
    return {
      name: this.name,
      status: this.status,
      code: this.code,
      message: this.message,
      errors: this.errors,
    };
  }
}

const HTTP_ERROR_FALLBACK = {
  400: { code: 'INVALID_REQUEST', message: 'Invalid request' },
  401: { code: 'UNAUTHORIZED', message: 'Authentication failed' },
  403: { code: 'FORBIDDEN', message: 'Caller is not authorized' },
  404: { code: 'NOT_FOUND', message: 'Resource was not found' },
  422: { code: 'VERIFICATION_FAILED', message: 'Verification failed' },
  500: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
};

const ERROR_ITEM_FIELDS = ['errorCode', 'domain', 'message', 'localizedMessage'];

// Allowlist error fields to keep unexpected request echoes out of SDK errors.
const parseErrorItems = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const out = {};
      ERROR_ITEM_FIELDS.forEach((field) => {
        if (typeof item[field] === 'string') {
          out[field] = item[field];
        }
      });
      return out;
    });
};

const errorFromResponse = ({ status, body }) => {
  const fallback = HTTP_ERROR_FALLBACK[status] || {
    code: 'UNKNOWN_ERROR',
    message: 'Request failed',
  };
  const errors = body && typeof body === 'object' ? parseErrorItems(body.errors) : [];
  const first = errors.find((item) => item.errorCode);
  const message =
    body && typeof body === 'object' && typeof body.message === 'string'
      ? body.message
      : fallback.message;
  return new TokenizationApiError({
    status,
    code: (first && first.errorCode) || fallback.code,
    message,
    errors,
  });
};

const errorFromMalformedResponse = ({ status }) =>
  new TokenizationApiError({
    status,
    code: 'MALFORMED_RESPONSE',
    message: 'Response was not valid JSON',
  });

module.exports = {
  TokenizationApiError,
  HTTP_ERROR_FALLBACK,
  errorFromResponse,
  errorFromMalformedResponse,
};
