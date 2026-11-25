const { requestTimeoutError } = require('./errors');

// Internal budget: credentials, sending and reading the body share one deadline.
const REQUEST_DEADLINE_MS = 30000;

const withRequestDeadline = operation => new Promise((resolve, reject) => {
  const expiresAt = Date.now() + REQUEST_DEADLINE_MS;
  let controller;
  try {
    if (typeof globalThis.AbortController === 'function') {
      controller = new globalThis.AbortController();
    }
  } catch {
    // Older React Native runtimes may not implement AbortController.
  }
  let settled = false;
  let expired = false;
  const finish = (complete, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    complete(value);
  };
  const expire = () => {
    if (settled) return;
    expired = true;
    finish(reject, requestTimeoutError());
    try {
      controller?.abort();
    } catch {
      // Rejection is authoritative even if abort is unsupported or ignored.
    }
  };
  const timer = setTimeout(expire, REQUEST_DEADLINE_MS);
  const throwIfExpired = () => {
    if (expired || Date.now() >= expiresAt) {
      expire();
      throw requestTimeoutError();
    }
  };
  let pending;
  try {
    pending = operation({ signal: controller?.signal, throwIfExpired });
  } catch (error) {
    finish(reject, error);
    return;
  }
  Promise.resolve(pending).then(
    value => {
      if (Date.now() >= expiresAt) expire();
      else finish(resolve, value);
    },
    error => {
      if (Date.now() >= expiresAt) expire();
      else finish(reject, error);
    },
  );
});

module.exports = { withRequestDeadline };
