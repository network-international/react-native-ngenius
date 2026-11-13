// Presentation only. Do not pass this view model to a payment or wallet API.
// The code allowlist supports Intl engines without supportedValuesOf(). Currency
// fraction digits always come from Intl; there is no guessed two-decimal fallback.
const KNOWN_CURRENCIES = new Set((
  'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD ' +
  'CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP ' +
  'GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR ' +
  'KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV ' +
  'MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG ' +
  'SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN ' +
  'UYI UYU UYW UZS VED VES VND VUV WST XAF XCD XCG XDR XOF XPF XSU YER ZAR ZMW ZWG ZWL'
).split(' '));

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const languageCode = value => {
  if (typeof value !== 'string') return undefined;
  const language = value.toLowerCase().split(/[-_]/)[0];
  return ['en', 'fr', 'ar'].includes(language) ? language : undefined;
};
const plainText = value =>
  typeof value === 'string' && value.trim() &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    ? value.trim() : undefined;

const currencyDigits = currencyCode => {
  if (typeof Intl === 'undefined' || typeof Intl.NumberFormat !== 'function') return null;
  let recognized = KNOWN_CURRENCIES.has(currencyCode);
  if (!recognized && typeof Intl.supportedValuesOf === 'function') {
    try { recognized = Intl.supportedValuesOf('currency').includes(currencyCode); } catch { /* Omit unknown codes. */ }
  }
  if (!recognized) return null;
  try {
    const { minimumFractionDigits } = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).resolvedOptions();
    return Number.isInteger(minimumFractionDigits) && minimumFractionDigits >= 0 && minimumFractionDigits <= 6
      ? minimumFractionDigits : null;
  } catch { return null; }
};

const integerMinorValue = value => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return /^\d{1,80}$/.test(text) ? text.replace(/^0+(?=\d)/, '') : null;
};

const canonicalMajorToMinor = (value, digits) => {
  if (typeof value !== 'string' || value.length > 90) return null;
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [integer, fraction = ''] = text.split('.');
  // Excess trailing zeroes are exact; any other excess precision is rejected,
  // never rounded or truncated to an amount the merchant did not supply.
  if (fraction.slice(digits).replace(/0/g, '')) return null;
  return integerMinorValue(integer + fraction.slice(0, digits).padEnd(digits, '0'));
};

const exactDisplay = (formattedValue, digits, language) => {
  let group = ',';
  let decimal = '.';
  let digitMap = null;
  try {
    const formatter = new Intl.NumberFormat(language, { useGrouping: true, minimumFractionDigits: digits, maximumFractionDigits: digits });
    if (typeof formatter.formatToParts === 'function') {
      const parts = formatter.formatToParts(12345.6);
      group = parts.find(part => part.type === 'group')?.value || '';
      decimal = parts.find(part => part.type === 'decimal')?.value || '.';
      const whole = new Intl.NumberFormat(language, { useGrouping: false });
      digitMap = Array.from({ length: 10 }, (_, digit) =>
        whole.formatToParts(digit).filter(part => part.type === 'integer').map(part => part.value).join(''));
    }
  } catch { /* The canonical exact amount remains readable without locale parts. */ }
  const [integer, fraction] = formattedValue.split('.');
  const grouped = group ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, group) : integer;
  const text = fraction === undefined ? grouped : `${grouped}${decimal}${fraction}`;
  return digitMap ? text.replace(/\d/g, digit => digitMap[Number(digit)]) : text;
};

const normalizeOrderMoney = (value, language = 'en') => {
  if (!isRecord(value) || typeof value.currencyCode !== 'string') return null;
  const currencyCode = value.currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) return null;
  const minorUnit = currencyDigits(currencyCode);
  if (minorUnit === null) return null;
  const minorValue = value.value === undefined || value.value === null
    ? canonicalMajorToMinor(value.formattedValue, minorUnit) : integerMinorValue(value.value);
  if (minorValue === null) return null;
  const padded = minorValue.padStart(minorUnit + 1, '0');
  const formattedValue = minorUnit
    ? `${padded.slice(0, -minorUnit)}.${padded.slice(-minorUnit)}` : padded;
  return { currencyCode, value: minorValue, minorUnit, formattedValue,
    text: `${currencyCode} ${exactDisplay(formattedValue, minorUnit, languageCode(language) || 'en')}` };
};

const normalizedQuantity = value => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? String(value) : undefined;
  if (typeof value !== 'string' || value.length > 80) return undefined;
  return /^\d+(?:\.\d+)?$/.test(value.trim()) ? value.trim() : undefined;
};

const normalizeOrderDetails = ({ orderDetails, order, language } = {}) => {
  const explicit = orderDetails !== undefined && orderDetails !== null;
  const source = explicit ? orderDetails : order;
  if (!isRecord(source)) return null;
  const resolvedLanguage = languageCode(language) || languageCode(source.language) || 'en';
  const summary = isRecord(source.orderSummary) ? source.orderSummary : {};
  const items = Array.isArray(summary.items) ? summary.items.reduce((result, item, index) => {
    if (!isRecord(item)) return result;
    const description = plainText(item.description);
    if (!description) return result;
    const normalized = { id: `item-${index}`, description,
      totalPrice: normalizeOrderMoney(item.totalPrice, resolvedLanguage) };
    const category = plainText(item.category);
    const quantity = normalizedQuantity(item.quantity);
    if (category) normalized.category = category;
    if (quantity !== undefined) normalized.quantity = quantity;
    result.push(normalized);
    return result;
  }, []) : [];
  const amount = normalizeOrderMoney(source.amount, resolvedLanguage);
  const shipping = normalizeOrderMoney(summary.shipping, resolvedLanguage);
  const tax = normalizeOrderMoney(summary.tax, resolvedLanguage);
  const total = normalizeOrderMoney(summary.total, resolvedLanguage);
  if (!amount && !items.length && !shipping && !tax && !total) return null;
  return { language: resolvedLanguage, amount, items, shipping, tax, total };
};

module.exports = { normalizeOrderDetails, normalizeOrderMoney };
