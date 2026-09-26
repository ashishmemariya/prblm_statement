import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../app.js';
import User, { USER_ROLES } from '../models/User.js';
import { generateToken, verifyToken } from '../utils/token.js';
import { generateSecureOTP, hashOTP, verifyOTPHash } from '../utils/otp.js';

let mongoServer;
let server;
let baseUrl;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) server.close();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe('StockSense Auth & User Management Test Suite', () => {
  let staffToken;
  let managerToken;
  let staffUserId;

  it('1. POST /api/auth/signup - Successfully registers a new user (first user = inventory_manager)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Manager User',
        email: 'manager@stocksense.app',
        password: 'Password123',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.success, true);
    assert.equal(data.data.user.email, 'manager@stocksense.app');
    assert.equal(data.data.user.role, USER_ROLES.INVENTORY_MANAGER);
    assert.equal(data.data.user.password, undefined); // Password never leaked
    assert.ok(data.data.token);
    managerToken = data.data.token;
  });

  it('2. POST /api/auth/signup - Subsequent signup defaults to warehouse_staff', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Staff Member',
        email: 'staff@stocksense.app',
        password: 'Password123',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.success, true);
    assert.equal(data.data.user.role, USER_ROLES.WAREHOUSE_STAFF);
    assert.equal(data.data.user.password, undefined);
    assert.ok(data.data.token);
    staffToken = data.data.token;
    staffUserId = data.data.user._id;
  });

  it('3. POST /api/auth/signup - Rejects duplicate email', async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Staff',
        email: 'staff@stocksense.app',
        password: 'Password123',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.match(data.message, /already exists/i);
  });

  it('4. POST /api/auth/login - Successfully logs in with valid credentials', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@stocksense.app',
        password: 'Password123',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.data.user.email, 'staff@stocksense.app');
    assert.equal(data.data.user.password, undefined);
    assert.ok(data.data.token);
  });

  it('5. POST /api/auth/login - Rejects incorrect password', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@stocksense.app',
        password: 'WrongPassword!',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 401);
    assert.equal(data.success, false);
    assert.match(data.message, /invalid email or password/i);
  });

  it('6. POST /api/auth/login - Rejects nonexistent user', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@stocksense.app',
        password: 'Password123',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 401);
    assert.equal(data.success, false);
    assert.match(data.message, /invalid email or password/i);
  });

  it('7. GET /api/auth/me - Returns current user profile with valid Bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.data.user.email, 'staff@stocksense.app');
    assert.equal(data.data.user.password, undefined);
    assert.equal(data.data.user.resetPasswordOtpHash, undefined);
  });

  it('8. GET /api/auth/me - Rejects missing Authorization header', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'GET',
    });

    const data = await res.json();
    assert.equal(res.status, 401);
    assert.equal(data.success, false);
    assert.match(data.message, /token required/i);
  });

  it('9. GET /api/auth/me - Rejects invalid / malformed JWT', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer invalid.token.payload',
      },
    });

    const data = await res.json();
    assert.equal(res.status, 401);
    assert.equal(data.success, false);
    assert.match(data.message, /invalid or expired token/i);
  });

  it('10. OTP Password Reset Flow - Generates, verifies, and resets password', async () => {
    // Step 1: Request OTP
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'staff@stocksense.app' }),
    });

    const forgotData = await forgotRes.json();
    assert.equal(forgotRes.status, 200);
    assert.equal(forgotData.success, true);
    assert.ok(forgotData.devOtp); // Provided in dev mode

    const otp = forgotData.devOtp;

    // Verify OTP is hashed in DB
    const userInDb = await User.findOne({ email: 'staff@stocksense.app' }).select('+resetPasswordOtpHash');
    assert.ok(userInDb.resetPasswordOtpHash);
    assert.notEqual(userInDb.resetPasswordOtpHash, otp); // Not stored in plain text!

    // Step 2: Reject invalid OTP
    const badOtpRes = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@stocksense.app',
        otp: '000000',
      }),
    });
    const badOtpData = await badOtpRes.json();
    assert.equal(badOtpRes.status, 400);
    assert.equal(badOtpData.success, false);

    // Step 3: Verify valid OTP
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@stocksense.app',
        otp,
      }),
    });
    const verifyData = await verifyRes.json();
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyData.success, true);

    // Step 4: Reset password with OTP
    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@stocksense.app',
        otp,
        newPassword: 'BrandNewPassword456',
      }),
    });
    const resetData = await resetRes.json();
    assert.equal(resetRes.status, 200);
    assert.equal(resetData.success, true);

    // Step 5: OTP cannot be reused
    const reuseRes = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@stocksense.app',
        otp,
      }),
    });
    assert.equal(reuseRes.status, 400);

    // Step 6: Old password no longer works
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@stocksense.app',
        password: 'Password123',
      }),
    });
    assert.equal(oldLoginRes.status, 401);

    // Step 7: New password works
    const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@stocksense.app',
        password: 'BrandNewPassword456',
      }),
    });
    const newLoginData = await newLoginRes.json();
    assert.equal(newLoginRes.status, 200);
    assert.equal(newLoginData.success, true);
  });

  it('11. Expired OTP is rejected', async () => {
    // Generate OTP and manually expire it in DB
    await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'staff@stocksense.app' }),
    });

    const user = await User.findOne({ email: 'staff@stocksense.app' }).select('+resetPasswordOtpExpires');
    user.resetPasswordOtpExpires = new Date(Date.now() - 60000); // 1 minute in the past
    await user.save({ validateBeforeSave: false });

    const expiredRes = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'staff@stocksense.app',
        otp: '123456',
      }),
    });

    const expiredData = await expiredRes.json();
    assert.equal(expiredRes.status, 400);
    assert.equal(expiredData.success, false);
    assert.match(expiredData.message, /invalid or expired otp/i);
  });
});
