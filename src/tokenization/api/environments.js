const TOKENIZATION_ENVIRONMENTS = {
  production: 'https://api.network.global/v1',
  uat: 'https://api-uat.network.global/v1',
};

const resolveTokenizationBaseUrl = (environment) => {
  if (environment && TOKENIZATION_ENVIRONMENTS[environment]) {
    return TOKENIZATION_ENVIRONMENTS[environment];
  }
  throw new Error(
    "tokenization environment must be 'uat' or 'production'"
  );
};

module.exports = {
  TOKENIZATION_ENVIRONMENTS,
  resolveTokenizationBaseUrl,
};
