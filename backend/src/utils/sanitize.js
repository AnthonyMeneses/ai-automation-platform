// C0 control characters except tab (09) and newline (0A/0D), plus DEL (7F).
// Built via the RegExp constructor so the source file stays free of raw
// control bytes.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

// Strip control characters and cap length before sending untrusted text to
// the model.
function sanitizeForModel(text, maxLength = 50000) {
  if (text === null || text === undefined) return '';
  return String(text).replace(CONTROL_CHARS, '').trim().slice(0, maxLength);
}

// Best-effort PII scrub for anything leaving our infrastructure (e.g. AI review
// of payroll data). Over-redaction is acceptable; under-redaction is not.
function redactPII(text) {
  return String(text)
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED-SSN]')
    .replace(/\b(?:\d[ -]?){13,16}\b/g, '[REDACTED-CARD]')
    .replace(/\b\d{9}\b/g, '[REDACTED-TAXID]');
}

// Escape LIKE/ILIKE wildcards so user search input is matched literally.
// Postgres' default LIKE escape character is backslash.
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

module.exports = { sanitizeForModel, redactPII, escapeLike };
