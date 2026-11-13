// A tokenRef can exist before verification; only VERIFIED means success.
const VERIFICATION_STATES = Object.freeze({
  READY: 'READY',
  SUBMITTING: 'SUBMITTING',
  VERIFYING: 'VERIFYING',
  AWAITING_3DS: 'AWAITING_3DS',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
});

const BUSY_STATES = [VERIFICATION_STATES.SUBMITTING, VERIFICATION_STATES.VERIFYING];

const isBusyState = (state) => BUSY_STATES.indexOf(state) !== -1;

const stateForSavedToken = (savedToken) => {
  const status = savedToken && savedToken.status;
  if (status === 'VERIFIED') {
    return VERIFICATION_STATES.SUCCESS;
  }
  if (status === 'AWAIT_3DS') {
    return VERIFICATION_STATES.AWAITING_3DS;
  }
  return VERIFICATION_STATES.FAILED;
};

module.exports = {
  VERIFICATION_STATES,
  isBusyState,
  stateForSavedToken,
};
