import crypto from 'crypto';

function getEncryptionKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw || raw.trim().length < 16) {
    throw new Error('BACKUP_ENCRYPTION_KEY environment variable is required (min 16 characters).');
  }
  return crypto.createHash('sha256').update(raw.trim()).digest();
}

export function encryptBackupJson(plaintextJson: string) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const checksum = crypto.createHash('sha256').update(plaintextJson, 'utf8').digest('hex');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintextJson, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted_payload: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
    sha256_checksum: checksum,
    size_bytes: Buffer.byteLength(plaintextJson, 'utf8'),
  };
}

export function decryptBackupJson(params: {
  encrypted_payload: string;
  iv: string;
  auth_tag: string;
  sha256_checksum: string;
}): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(params.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(params.auth_tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(params.encrypted_payload, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  const actualChecksum = crypto.createHash('sha256').update(decrypted, 'utf8').digest('hex');
  if (actualChecksum !== params.sha256_checksum) {
    throw new Error('Backup integrity check failed (SHA-256 checksum mismatch).');
  }

  return decrypted;
}
