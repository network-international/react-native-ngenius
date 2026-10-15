// UIKit cannot present the native sheet while the React Native modal owns the root.
// Wait for dismissal; the gate prevents the dismissal callback and timer from racing.
const RN_MODAL_DISMISS_MS = 500;

const createNativePresentationGate = (onStart) => {
  let started = false;
  const start = () => {
    if (started) {
      return false;
    }
    started = true;
    onStart();
    return true;
  };
  return {
    start,
    onDismiss: start,
    hasStarted: () => started,
  };
};

module.exports = {
  RN_MODAL_DISMISS_MS,
  createNativePresentationGate,
};
