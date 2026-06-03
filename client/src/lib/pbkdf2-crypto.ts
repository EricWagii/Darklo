/**
 * PBKDF2 密码哈希和验证
 * 使用 Web Crypto API 实现安全的密码存储
 */

/**
 * 生成随机盐
 */
function generateSalt(length: number = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * 将 Uint8Array 转换为十六进制字符串
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 将十六进制字符串转换为 Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * 使用 PBKDF2 哈希密码
 * 返回格式：salt:hash（都是十六进制）
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt(16);
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  const key = await crypto.subtle.importKey(
    'raw',
    data,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000, // 足够安全的迭代次数
      hash: 'SHA-256',
    },
    key,
    256 // 256 位 = 32 字节
  );

  const hashArray = new Uint8Array(derivedBits);
  const saltHex = bytesToHex(salt);
  const hashHex = bytesToHex(hashArray);

  return `${saltHex}:${hashHex}`;
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) {
      console.error('Invalid hash format');
      return false;
    }

    const salt = hexToBytes(saltHex);
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    const key = await crypto.subtle.importKey(
      'raw',
      data,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      256
    );

    const hashArray = new Uint8Array(derivedBits);
    const computedHashHex = bytesToHex(hashArray);

    // 使用恒定时间比较防止时序攻击
    return constantTimeCompare(computedHashHex, hashHex);
  } catch (err) {
    console.error('Password verification failed:', err);
    return false;
  }
}

/**
 * 恒定时间字符串比较（防止时序攻击）
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * 迁移旧密码到 PBKDF2
 * 用于从旧的简单哈希迁移到新的安全哈希
 */
export async function migratePasswordHash(oldHash: string, password: string): Promise<string> {
  // 如果已经是 PBKDF2 格式（包含冒号），则直接返回
  if (oldHash.includes(':')) {
    return oldHash;
  }

  // 否则生成新的 PBKDF2 哈希
  return await hashPassword(password);
}
