import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import * as authController from '../controllers/authController.js';
import User, { USER_ROLES } from '../models/User.js';
import { generateSecureOTP, hashOTP } from '../utils/otp.js';

// Helper mock response
const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('Auth Controller Mocked Integration Tests', () => {
  it('Signup validation: requires name, email, and password >= 6 chars', async () => {
    // Missing name
    const req1 = { body: { email: 'test@example.com', password: '123' } };
    const res1 = createMockRes();
    await authController.signup(req1, res1, () => {});
    assert.equal(res1.statusCode, 400);
    assert.match(res1.body.message, /name is required/i);

    // Short password
    const req2 = { body: { name: 'Test', email: 'test@example.com', password: '123' } };
    const res2 = createMockRes();
    await authController.signup(req2, res2, () => {});
    assert.equal(res2.statusCode, 400);
    assert.match(res2.body.message, /at least 6 characters/i);
  });

  it('Login validation: requires email and password', async () => {
    const req = { body: { email: '' } };
    const res = createMockRes();
    await authController.login(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /please provide email and password/i);
  });

  it('getMe: returns req.user cleanly', async () => {
    const mockUser = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Alex Harrison',
      email: 'alex@enterprise.com',
      role: USER_ROLES.INVENTORY_MANAGER,
    };
    const req = { user: mockUser };
    const res = createMockRes();
    await authController.getMe(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.user, mockUser);
  });

  it('forgotPassword validation: requires email', async () => {
    const req = { body: {} };
    const res = createMockRes();
    await authController.forgotPassword(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /valid email address/i);
  });

  it('verifyOtp validation: requires email and otp', async () => {
    const req = { body: { email: 'test@test.com' } };
    const res = createMockRes();
    await authController.verifyOtp(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /email and otp are required/i);
  });

  it('resetPassword validation: requires email, otp, and password >= 6', async () => {
    const req = { body: { email: 'test@test.com', otp: '123456', password: '123' } };
    const res = createMockRes();
    await authController.resetPassword(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /at least 6 characters/i);
  });
});
