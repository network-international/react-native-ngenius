const encodePathSegment = (value, name) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return encodeURIComponent(value);
};

const paymentMethodsCollectionPath = ({ outletId, consumerId }) =>
  `/outlets/${encodePathSegment(outletId, 'outletId')}/consumers/${encodePathSegment(
    consumerId,
    'consumerId'
  )}/payment-methods`;

const paymentMethodItemPath = ({ outletId, consumerId, tokenRef }) =>
  `${paymentMethodsCollectionPath({ outletId, consumerId })}/${encodePathSegment(
    tokenRef,
    'tokenRef'
  )}`;

const TOKENIZATION_PATHS = {
  listPaymentMethods: paymentMethodsCollectionPath,
  createCardPaymentMethod: (ids) =>
    `${paymentMethodsCollectionPath(ids)}/card`,
  createWalletPaymentMethod: (ids) =>
    `${paymentMethodsCollectionPath(ids)}/wallet`,
  getPaymentMethod: paymentMethodItemPath,
  deletePaymentMethod: paymentMethodItemPath,
  validatePaymentMethod: (ids) => `${paymentMethodItemPath(ids)}/validate`,
};

const resolveTokenizationUrl = (baseUrl, path) => {
  const root = String(baseUrl).replace(/\/+$/, '');
  return `${root}${path}`;
};

module.exports = {
  encodePathSegment,
  TOKENIZATION_PATHS,
  resolveTokenizationUrl,
};
