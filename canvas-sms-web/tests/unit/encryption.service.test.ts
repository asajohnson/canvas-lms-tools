import { EncryptionService } from '../../src/services/encryption.service';

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;

  beforeAll(() => {
    encryptionService = new EncryptionService();
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const plaintext = 'my_secret_canvas_token_12345';
      const { encrypted, iv, authTag } = encryptionService.encrypt(plaintext);

      expect(encrypted).toBeTruthy();
      expect(iv).toBeTruthy();
      expect(authTag).toBeTruthy();

      const decrypted = encryptionService.decrypt(encrypted, iv, authTag);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      const plaintext = 'test_data';
      const result1 = encryptionService.encrypt(plaintext);
      const result2 = encryptionService.encrypt(plaintext);

      expect(result1.encrypted).not.toBe(result2.encrypted);
      expect(result1.iv).not.toBe(result2.iv);

      // But both should decrypt to same plaintext
      expect(encryptionService.decrypt(result1.encrypted, result1.iv, result1.authTag)).toBe(plaintext);
      expect(encryptionService.decrypt(result2.encrypted, result2.iv, result2.authTag)).toBe(plaintext);
    });

    it('should throw error on tampered data', () => {
      const plaintext = 'sensitive_data';
      const { encrypted, iv, authTag } = encryptionService.encrypt(plaintext);

      // Tamper with encrypted data
      const tamperedEncrypted = encrypted.slice(0, -2) + 'ff';

      expect(() => {
        encryptionService.decrypt(tamperedEncrypted, iv, authTag);
      }).toThrow();
    });
  });

  describe('generateMasterKey', () => {
    it('should generate 64 character hex string', () => {
      const key = EncryptionService.generateMasterKey();
      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
    });
  });

  describe('password hashing', () => {
    it('should hash and verify password correctly', async () => {
      const password = 'mySecurePassword123!';
      const hash = await encryptionService.hashPassword(password);

      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);

      const isValid = await encryptionService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'correct_password';
      const hash = await encryptionService.hashPassword(password);

      const isValid = await encryptionService.verifyPassword('wrong_password', hash);
      expect(isValid).toBe(false);
    });
  });
});
