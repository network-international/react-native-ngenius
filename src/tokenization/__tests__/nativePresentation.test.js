const {
  createNativePresentationGate,
  RN_MODAL_DISMISS_MS,
} = require('../nativePresentation');

describe('createNativePresentationGate', () => {
  it('starts native UI once when onDismiss fires', () => {
    const onStart = jest.fn();
    const gate = createNativePresentationGate(onStart);
    expect(gate.onDismiss()).toBe(true);
    expect(gate.onDismiss()).toBe(false);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('starts native UI once from the dismiss timeout fallback', () => {
    const onStart = jest.fn();
    const gate = createNativePresentationGate(onStart);
    expect(gate.start()).toBe(true);
    expect(gate.start()).toBe(false);
    expect(gate.hasStarted()).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('keeps a dismiss wait long enough for RN Modal animation', () => {
    expect(RN_MODAL_DISMISS_MS).toBeGreaterThanOrEqual(400);
  });
});
