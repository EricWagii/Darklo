/**
 * 种子脚本：初始化测试账户
 * 用于演示跨设备登录功能
 * 
 * 使用方式：
 * node server/seed-test-users.mjs
 */

import crypto from 'crypto';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Parse MySQL connection string
function parseConnectionString(url) {
  const match = url.match(
    /mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/
  );
  if (!match) {
    throw new Error('Invalid DATABASE_URL format');
  }
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4]),
    database: match[5],
    ssl: {}, // Enable SSL with default settings
  };
}

// Hash password using PBKDF2
function hashPassword(password) {
  const iterations = 100000;
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, iterations, 64, 'sha256')
    .toString('hex');
  return `pbkdf2$100000$${salt}$${hash}`;
}

async function seedTestUsers() {
  const config = parseConnectionString(DATABASE_URL);

  const connection = await mysql.createConnection(config);

  try {
    console.log('🌱 Starting to seed test users...');

    // Test users
    const testUsers = [
      {
        username: 'testuser',
        password: 'password123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
      },
      {
        username: 'admin',
        password: 'admin123',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin',
      },
      {
        username: 'demo',
        password: 'demo123',
        name: 'Demo User',
        email: 'demo@example.com',
        role: 'user',
      },
    ];

    for (const user of testUsers) {
      const passwordHash = hashPassword(user.password);
      const now = new Date();

      try {
        await connection.execute(
          `INSERT INTO users (username, passwordHash, name, email, role, loginMethod, createdAt, updatedAt, lastSignedIn)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.username,
            passwordHash,
            user.name,
            user.email,
            user.role,
            'local',
            now,
            now,
            now,
          ]
        );
        console.log(`✅ Created user: ${user.username} (password: ${user.password})`);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          console.log(`⚠️  User ${user.username} already exists, skipping...`);
        } else {
          throw error;
        }
      }
    }

    console.log('✅ Test users seeded successfully!');
    console.log('\n📝 Test Credentials:');
    console.log('  - Username: testuser, Password: password123');
    console.log('  - Username: admin, Password: admin123');
    console.log('  - Username: demo, Password: demo123');
  } finally {
    await connection.end();
  }
}

seedTestUsers().catch((error) => {
  console.error('❌ Error seeding test users:', error);
  process.exit(1);
});
