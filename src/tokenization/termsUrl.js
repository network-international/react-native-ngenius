const supportedTermsUrl = (value) => {
  if (typeof value !== 'string') return null;
  const url = value;
  if (/[\s\\\u0000-\u001f\u007f]/.test(url)) return null;
  const match = /^(https?):\/\/([^/?#]+)(?:[/?#].*)?$/i.exec(url);
  if (!match) return null;
  // Restrict terms to web URLs so backend configuration cannot launch native schemes.
  const authority = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(match[2]);
  if (!authority || (authority[2] && (+authority[2] < 1 || +authority[2] > 65535))) return null;
  const validHost = authority[1].split('.').every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
  return validHost ? url : null;
};

module.exports = { supportedTermsUrl };
