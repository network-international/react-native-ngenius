// Validate only: keep the backend-resolved destination, query and fragment intact.
const supportedTermsUrl = (value) => {
  if (typeof value !== 'string') return null;
  const url = value;
  if (/[\s\\\u0000-\u001f\u007f]/.test(url)) return null;
  const match = /^(https?):\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(url);
  if (!match) return null;
  // Absolute web URLs only. Do not infer schemes, expand relative paths, or
  // dispatch arbitrary native schemes returned by a malformed configuration.
  const authority = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(match[2]);
  if (!authority || (authority[2] && (+authority[2] < 1 || +authority[2] > 65535))) return null;
  const validHost = authority[1].split('.').every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
  return validHost ? url : null;
};

module.exports = { supportedTermsUrl };
