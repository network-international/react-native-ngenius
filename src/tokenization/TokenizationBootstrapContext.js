const React = require('react');

// Internal, session-scoped adapter boundary. Not exported from the SDK entrypoint.
// The future init adapter supplies the resolved value; no backend response shape
// or transport is assumed here. Mount a fresh provider for each init session.
const TokenizationBootstrapContext = React.createContext(null);

const readResolvedTncUrl = ({ bootstrap, order, visible, consentOff }) => {
  if (!visible || consentOff === true || !bootstrap || bootstrap.nativeOrder !== order) {
    return undefined;
  }
  return bootstrap.resolvedTncUrl;
};

module.exports = { TokenizationBootstrapContext, readResolvedTncUrl };
