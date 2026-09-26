import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { generateToken } from '../utils/token.js';
import { USER_ROLES } from '../models/User.js';

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

describe('Auth Middleware Unit Tests', () => {
  it('Rejects requests without Authorization header with 401', async () => {
    const req = { headers: {} };
    const res = createMockRes();
    let nextCalled = false;
    await authMiddleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /authorization token required/i);
  });

  it('Rejects requests with malformed Bearer token with 401', async () => {
    const req = { headers: { authorization: 'Bearer malformed.invalid.token' } };
    const res = createMockRes();
    let nextCalled = false;
    await authMiddleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /invalid or expired token/i);
  });
});
