import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { generateToken, verifyToken } from '../utils/token.js';
import { generateSecureOTP, hashOTP, verifyOTPHash } from '../utils/otp.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { USER_ROLES } from '../models/User.js';

describe('StockSense Auth Unit Tests', () => {
  describe('JWT Token Utils', () => {
    it('generates and verifies a valid JWT payload with role and id', () => {
      const payload = { userId: 'usr-12345', role: USER_ROLES.INVENTORY_MANAGER };
      const token = generateToken(payload.userId, payload.role);

      assert.ok(typeof token === 'string' && token.length > 20);

      const decoded = verifyToken(token);
      assert.equal(decoded.id, payload.userId);
      assert.equal(decoded.role, payload.role);
    });

    it('throws error when verifying an invalid token', () => {
      assert.throws(() => {
        verifyToken('malformed.fake.token');
      });
    });
  });

  describe('OTP Security Utils', () => {
    it('generates a 6-digit cryptographically secure numeric OTP', () => {
      const otp1 = generateSecureOTP();
      const otp2 = generateSecureOTP();

      assert.equal(otp1.length, 6);
      assert.equal(otp2.length, 6);
      assert.ok(/^\d{6}$/.test(otp1));
      assert.ok(/^\d{6}$/.test(otp2));
    });

    it('hashes OTP securely using bcrypt and never matches plain text directly', async () => {
      const otp = '849201';
      const hash = await hashOTP(otp);

      assert.notEqual(otp, hash);
      assert.ok(hash.startsWith('$2'));

      // Verify correct OTP matches hash
      const isValid = await verifyOTPHash(otp, hash);
      assert.equal(isValid, true);

      // Verify wrong OTP fails
      const isInvalid = await verifyOTPHash('123456', hash);
      assert.equal(isInvalid, false);
    });
  });

  describe('Role-based Authorization Middleware', () => {
    it('permits access when user role matches allowed roles', () => {
      const middleware = roleMiddleware(USER_ROLES.INVENTORY_MANAGER);
      const req = { user: { id: '1', role: USER_ROLES.INVENTORY_MANAGER } };
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };
      const res = {};

      middleware(req, res, next);
      assert.equal(nextCalled, true);
    });

    it('denies access (403) when user role is insufficient', () => {
      const middleware = roleMiddleware(USER_ROLES.INVENTORY_MANAGER);
      const req = { user: { id: '2', role: USER_ROLES.WAREHOUSE_STAFF } };
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      let statusCode = null;
      let jsonPayload = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          jsonPayload = data;
          return this;
        },
      };

      middleware(req, res, next);
      assert.equal(nextCalled, false);
      assert.equal(statusCode, 403);
      assert.equal(jsonPayload.success, false);
      assert.match(jsonPayload.message, /access denied/i);
    });
  });
});
