import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  validateUsername,
  validatePassword,
  generateSessionId,
} from './auth-utils';

describe('auth-utils', () => {
  describe('hashPassword and verifyPassword', () => {
    it('should hash a password and verify it correctly', () => {
      const password = 'test-password-123';
      const hash = hashPassword(password);

      // Hash should contain the algorithm, iterations, salt, and hash
      expect(hash).toMatch(/^pbkdf2\$\d+\$[a-f0-9]+\$[a-f0-9]+$/);

      // Should verify correct password
      expect(verifyPassword(password, hash)).toBe(true);
    });

    it('should reject incorrect password', () => {
      const password = 'test-password-123';
      const hash = hashPassword(password);

      expect(verifyPassword('wrong-password', hash)).toBe(false);
    });

    it('should generate different hashes for same password', () => {
      const password = 'test-password-123';
      const hash1 = hashPassword(password);
      const hash2 = hashPassword(password);

      // Hashes should be different (due to random salt)
      expect(hash1).not.toBe(hash2);

      // But both should verify the same password
      expect(verifyPassword(password, hash1)).toBe(true);
      expect(verifyPassword(password, hash2)).toBe(true);
    });

    it('should handle invalid hash format', () => {
      expect(verifyPassword('password', 'invalid-hash')).toBe(false);
      expect(verifyPassword('password', '')).toBe(false);
      expect(verifyPassword('password', 'sha256$salt$hash')).toBe(false);
    });
  });

  describe('validateUsername', () => {
    it('should accept valid usernames', () => {
      expect(validateUsername('user123')).toBe(true);
      expect(validateUsername('test_user')).toBe(true);
      expect(validateUsername('a_b_c')).toBe(true);
      expect(validateUsername('User_123')).toBe(true);
    });

    it('should reject invalid usernames', () => {
      expect(validateUsername('ab')).toBe(false); // Too short
      expect(validateUsername('a'.repeat(33))).toBe(false); // Too long
      expect(validateUsername('user-name')).toBe(false); // Contains dash
      expect(validateUsername('user@name')).toBe(false); // Contains @
      expect(validateUsername('user name')).toBe(false); // Contains space
      expect(validateUsername('')).toBe(false); // Empty
    });
  });

  describe('validatePassword', () => {
    it('should accept valid passwords', () => {
      expect(validatePassword('password')).toBe(true);
      expect(validatePassword('123456')).toBe(true);
      expect(validatePassword('a'.repeat(100))).toBe(true);
    });

    it('should reject invalid passwords', () => {
      expect(validatePassword('12345')).toBe(false); // Too short
      expect(validatePassword('')).toBe(false); // Empty
    });
  });

  describe('generateSessionId', () => {
    it('should generate a valid session ID', () => {
      const sessionId = generateSessionId();

      // Should be a hex string
      expect(sessionId).toMatch(/^[a-f0-9]+$/);

      // Should be 64 characters long (32 bytes in hex)
      expect(sessionId.length).toBe(64);
    });

    it('should generate different session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      expect(id1).not.toBe(id2);
    });
  });
});
