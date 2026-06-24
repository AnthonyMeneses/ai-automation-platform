const crypto = require('crypto');
const config = require('../config');

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function randomToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('hex');
}

function getEncryptionKey() {
  if (!/^[0-9a-f]{64}$/i.test(config.payroll.encryptionKey)) {
    throw new Error('PAYROLL_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(config.payroll.encryptionKey, 'hex');
}

// AES-256-GCM: output format is base64(iv).base64(authTag).base64(ciphertext)
function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

function decryptSecret(payload) {
  const parts = String(payload).split('.');
  if (parts.length !== 3) throw new Error('Malformed encrypted payload');
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { sha256, randomToken, encryptSecret, decryptSecret };
