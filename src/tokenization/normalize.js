const INVALID_BRANDING_VALUES = new Set([
  'null',
  'undefined',
  'none',
  'n/a',
  'na',
  'nil',
  'false',
]);

const normalizeThemeString = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (INVALID_BRANDING_VALUES.has(trimmed.toLowerCase())) {
    return undefined;
  }
  return trimmed;
};

const firstFontFamily = (fontValue) => {
  const normalized = normalizeThemeString(fontValue);
  if (!normalized) {
    return undefined;
  }
  const first = normalized.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  return first || undefined;
};

const parseHex = (hex) => {
  const normalized = normalizeThemeString(hex);
  if (!normalized) {
    return null;
  }
  const clean = normalized.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return null;
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

const normalizeColour = (value) => {
  const rgb = parseHex(value);
  if (!rgb) {
    return undefined;
  }
  const clean = String(value)
    .trim()
    .replace('#', '')
    .toUpperCase();
  return `#${clean}`;
};

const contrastButtonText = (backgroundHex, defaultGold, defaultGoldText) => {
  if (!backgroundHex || backgroundHex.toLowerCase() === defaultGold.toLowerCase()) {
    return defaultGoldText;
  }
  const rgb = parseHex(backgroundHex);
  if (!rgb) {
    return defaultGoldText;
  }
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.55 ? '#070707' : '#FFFFFF';
};

module.exports = {
  normalizeThemeString,
  firstFontFamily,
  parseHex,
  normalizeColour,
  contrastButtonText,
};
