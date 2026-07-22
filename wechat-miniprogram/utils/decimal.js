function sanitizeOneDecimalInput(value) {
  const raw = String(value || '').replace(/[^\d.]/g, '');
  if (!raw) return '';

  const dotIndex = raw.indexOf('.');
  if (dotIndex === -1) {
    return trimLeadingZeros(raw);
  }

  const integerPart = trimLeadingZeros(raw.slice(0, dotIndex)) || '0';
  const fractionPart = raw.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
  return `${integerPart}.${fractionPart}`;
}

function parseOneDecimal(value, fallback) {
  const sanitized = sanitizeOneDecimalInput(value);
  const num = Number(sanitized);
  if (!Number.isFinite(num)) return Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  return Math.round(num * 100) / 100;
}

function trimLeadingZeros(value) {
  return value.replace(/^0+(?=\d)/, '');
}

module.exports = {
  sanitizeOneDecimalInput,
  parseOneDecimal
};
