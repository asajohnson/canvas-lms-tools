// Jest test setup
// This file runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/canvas_sms_test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.ENCRYPTION_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.PORT = '3001';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Increase timeout for integration tests
jest.setTimeout(10000);
