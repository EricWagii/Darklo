import crypto from 'crypto';

/**
 * Hash a password using PBKDF2
 * @param password - Plain text password
 * @returns Hash string in format: algorithm$iterations$salt$hash
 */
export function hashPassword(password: string): string {
  const iterations = 100000;
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');
  return `pbkdf2$100000$${salt}$${hash}`;
}

/**
 * Verify a password against a hash
 * @param password - Plain text password to verify
 * @param hash - Hash string from hashPassword
 * @returns true if password matches, false otherwise
 */
export function verifyPassword(password: string, hash: string): boolean {
  try {
    const parts = hash.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
      return false;
    }

    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const storedHash = parts[3];

    const computedHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');
    return computedHash === storedHash;
  } catch (error) {
    console.error('[Auth] Password verification error:', error);
    return false;
  }
}

/**
 * Generate a session ID
 * @returns Random session ID
 */
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate username format
 * @param username - Username to validate
 * @returns true if valid, false otherwise
 */
export function validateUsername(username: string): boolean {
  // Username: 3-32 characters, alphanumeric and underscore only
  return /^[a-zA-Z0-9_]{3,32}$/.test(username);
}

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns true if valid, false otherwise
 */
export function validatePassword(password: string): boolean {
  // Password: at least 6 characters
  return password.length >= 6;
}
