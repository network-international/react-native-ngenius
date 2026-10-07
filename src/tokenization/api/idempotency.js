const createIdempotencyKey = () => {
  const cryptoObj =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  let bytes;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    bytes = cryptoObj.getRandomValues(new Uint8Array(16));
  } else {
    bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
};

const createIdempotencyStore = () => {
  const keys = Object.create(null);
  return {
    reset() {
      Object.keys(keys).forEach((id) => {
        delete keys[id];
      });
    },
    getOrCreate(operationId) {
      if (typeof operationId !== 'string' || operationId.length === 0) {
        throw new Error('operationId is required');
      }
      if (!keys[operationId]) {
        keys[operationId] = createIdempotencyKey();
      }
      return keys[operationId];
    },
    peek(operationId) {
      return keys[operationId] || null;
    },
  };
};

module.exports = {
  createIdempotencyKey,
  createIdempotencyStore,
};
