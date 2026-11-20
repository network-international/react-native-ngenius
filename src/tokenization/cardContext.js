// Private bridge configuration; no card data and no new public JS card-create API.
const contexts = new WeakMap();
const registerCardContext = (client, context) => {
  contexts.set(client, context);
  return client;
};
const cardContextFor = client => contexts.get(client);
module.exports = { registerCardContext, cardContextFor };
