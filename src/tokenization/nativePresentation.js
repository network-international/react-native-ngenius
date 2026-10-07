/**
 * iOS: NISdk presents CardPaymentViewController from the window root.
 * RN <Modal> is itself a presented UIViewController on that root.
 * UIKit will not present a second VC on a presenter that is already presenting.
 * Hide the RN Modal, wait for dismiss, then start native UI.
 */
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
