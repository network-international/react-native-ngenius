const { TokenizationApiError } = require('./api/errors');

const UsageType = Object.freeze({
  ONCE_OFF: 'ONCE_OFF',
  PERMANENT: 'PERMANENT',
});

const invalidUsageType = () => new TokenizationApiError({
  status: 0,
  code: 'INVALID_USAGE_TYPE',
  message: 'usageType must be ONCE_OFF or PERMANENT',
});

const validateUsageType = value => {
  if (value !== UsageType.ONCE_OFF && value !== UsageType.PERMANENT)
    throw invalidUsageType();
  return value;
};

module.exports = { UsageType, validateUsageType, invalidUsageType };
