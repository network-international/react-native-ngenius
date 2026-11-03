const { SDK_VERSION } = require('../version');
const { supportedTermsUrl } = require('./termsUrl');

const isoTimestamp = value => {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('Consent timestamp must be UTC ISO-8601');
  return value;
};
const localeFor = value =>
  ['en', 'fr', 'ar'].includes(String(value).toLowerCase().slice(0, 2))
    ? String(value).toLowerCase().slice(0, 2)
    : 'en';
const deviceData = ({ platform, osVersion, screen, timezoneOffsetMinutes }) => {
  const normalizedPlatform = String(platform).toUpperCase();
  if (!['IOS', 'ANDROID'].includes(normalizedPlatform))
    throw new Error('Consent platform is invalid');
  if (
    !['string', 'number'].includes(typeof osVersion) ||
    !String(osVersion).trim() ||
    (typeof osVersion === 'number' && !Number.isFinite(osVersion))
  )
    throw new Error('Consent OS version is invalid');
  if (
    !Number.isInteger(timezoneOffsetMinutes) ||
    Math.abs(timezoneOffsetMinutes) > 1440
  )
    throw new Error('Consent timezone offset is invalid');
  const device = {
    platform: normalizedPlatform,
    osVersion: String(osVersion),
    timezoneOffsetMinutes,
  };
  // Dimensions.get('screen') is in React Native logical screen units, not physical pixels.
  for (const [source, target] of [
    ['width', 'screenWidth'],
    ['height', 'screenHeight'],
  ]) {
    if (screen && Number.isFinite(screen[source]) && screen[source] > 0)
      device[target] = screen[source];
  }
  return Object.freeze(device);
};

const buildConsentData = ({
  skipConsent = false,
  accepted = false,
  acceptedAt,
  tncUrl,
  language = 'en',
  platform,
  osVersion,
  screen,
  now = () => new Date(),
  timezoneOffsetMinutes,
} = {}) => {
  if (skipConsent !== true && accepted !== true)
    throw new Error('Consent acceptance is required');
  const current = now();
  if (!(current instanceof Date) || !Number.isFinite(current.getTime()))
    throw new Error('Consent clock is invalid');
  const result = {
    status: skipConsent === true ? 'NOT_COLLECTED' : 'COLLECTED',
    ...(skipConsent === true ? { merchantSelectedSkipConsent: true } : {}),
    clientTimestamp:
      skipConsent === true ? current.toISOString() : isoTimestamp(acceptedAt),
    channel: 'REACT_NATIVE',
    sdk: Object.freeze({ name: 'react-native-ngenius', version: SDK_VERSION }),
    device: deviceData({
      platform,
      osVersion,
      screen,
      timezoneOffsetMinutes:
        timezoneOffsetMinutes === undefined
          ? current.getTimezoneOffset()
          : timezoneOffsetMinutes,
    }),
  };
  if (skipConsent !== true) {
    const url = supportedTermsUrl(tncUrl);
    if (url) result.tncUrl = url;
    result.locale = localeFor(language);
  }
  return Object.freeze(result);
};

// Strict wire allowlist, including nested fields. Merchant additions never pass through.
const serializeConsentData = value => {
  if (
    !value ||
    !['COLLECTED', 'NOT_COLLECTED'].includes(value.status) ||
    value.channel !== 'REACT_NATIVE'
  ) {
    throw new Error('Consent data is invalid');
  }
  const skipped = value.status === 'NOT_COLLECTED';
  if (skipped && value.merchantSelectedSkipConsent !== true)
    throw new Error('Merchant skip consent is required');
  const device = value.device || {};
  const output = buildConsentData({
    skipConsent: skipped,
    accepted: !skipped,
    acceptedAt: value.clientTimestamp,
    tncUrl: value.tncUrl,
    language: value.locale,
    platform: device.platform,
    osVersion: device.osVersion,
    screen: { width: device.screenWidth, height: device.screenHeight },
    timezoneOffsetMinutes: device.timezoneOffsetMinutes,
    now: () => new Date(isoTimestamp(value.clientTimestamp)),
  });
  return output;
};

const mapConsentRequest = ({ tokenData, consent }) => ({
  ...tokenData,
  consentData: serializeConsentData(consent),
});
module.exports = {
  buildConsentData,
  serializeConsentData,
  mapConsentRequest,
  localeFor,
};
