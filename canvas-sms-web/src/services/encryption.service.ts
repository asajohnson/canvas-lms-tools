import crypto from 'crypto';
import { env } from '../config/env';
import logger from '../utils/logger';

/**
 * EncryptionService - Handles AES-256-GCM encryption/decryption for sensitive data
 * Used primarily for encrypting Canvas API tokens and Twilio credentials
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly masterKey: Buffer;

  constructor() {
    // Master key from environment (must be 32 bytes for AES-256)
    this.masterKey = Buffer.from(env.ENCRYPTION_MASTER_KEY, 'hex');

    if (this.masterKey.length !== 32) {
      throw new Error('ENCRYPTION_MASTER_KEY must be 32 bytes (64 hex characters)');
    }
  }

  /**
   * Encrypts plaintext using AES-256-GCM
   * @param plaintext - The string to encrypt
   * @returns Object containing encrypted data, IV, and auth tag
   */
  encrypt(plaintext: string): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    try {
      // Generate random initialization vector (16 bytes for AES)
      const iv = crypto.randomBytes(16);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

      // Encrypt the plaintext
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag (ensures integrity)
      const authTag = cipher.getAuthTag();

      logger.debug('Data encrypted successfully');

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
      };
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts ciphertext using AES-256-GCM
   * @param encrypted - The encrypted hex string
   * @param iv - The initialization vector (hex string)
   * @param authTag - The authentication tag (hex string)
   * @returns The decrypted plaintext
   */
  decrypt(encrypted: string, iv: string, authTag: string): string {
    try {
      // Convert hex strings back to buffers
      const ivBuffer = Buffer.from(iv, 'hex');
      const authTagBuffer = Buffer.from(authTag, 'hex');

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.masterKey,
        ivBuffer
      );

      // Set authentication tag
      decipher.setAuthTag(authTagBuffer);

      // Decrypt the ciphertext
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      logger.debug('Data decrypted successfully');

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data - data may be corrupted or tampered with');
    }
  }

  /**
   * Generates a secure random encryption key (for generating ENCRYPTION_MASTER_KEY)
   * @returns 64-character hex string (32 bytes)
   */
  static generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hashes a password using bcrypt-compatible method
   * @param password - Plain text password
   * @returns Hashed password
   */
  async hashPassword(password: string): Promise<string> {
    const bcrypt = await import('bcrypt');
    return bcrypt.hash(password, 10);
  }

  /**
   * Verifies a password against its hash
   * @param password - Plain text password
   * @param hash - Hashed password
   * @returns True if password matches
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(password, hash);
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();
