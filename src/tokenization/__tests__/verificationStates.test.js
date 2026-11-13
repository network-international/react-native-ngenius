const {
  VERIFICATION_STATES,
  isBusyState,
  stateForSavedToken,
} = require('../verificationStates');

describe('verification states', () => {
  it('treats only VERIFIED as success', () => {
    expect(stateForSavedToken({ status: 'VERIFIED' })).toBe(VERIFICATION_STATES.SUCCESS);
    expect(stateForSavedToken({ status: 'AWAIT_3DS', tokenRef: 'tok_1' })).toBe(
      VERIFICATION_STATES.AWAITING_3DS
    );
    expect(stateForSavedToken({ status: 'FAILED' })).toBe(VERIFICATION_STATES.FAILED);
    expect(stateForSavedToken({ status: 'ACTIVE' })).toBe(VERIFICATION_STATES.FAILED);
    expect(stateForSavedToken(undefined)).toBe(VERIFICATION_STATES.FAILED);
  });

  it('marks submitting and verifying as busy', () => {
    expect(isBusyState(VERIFICATION_STATES.SUBMITTING)).toBe(true);
    expect(isBusyState(VERIFICATION_STATES.VERIFYING)).toBe(true);
    [
      VERIFICATION_STATES.READY,
      VERIFICATION_STATES.AWAITING_3DS,
      VERIFICATION_STATES.SUCCESS,
      VERIFICATION_STATES.FAILED,
    ].forEach((state) => expect(isBusyState(state)).toBe(false));
  });
});
