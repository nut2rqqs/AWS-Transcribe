import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthenticatedUserId } from '../src/auth.mjs';

test('reads the verified JWT subject from an HTTP API authorizer', () => {
  assert.equal(getAuthenticatedUserId({
    requestContext: { authorizer: { jwt: { claims: { sub: 'user-123' } } } }
  }), 'user-123');
});

test('supports the normalized REST authorizer claims shape', () => {
  assert.equal(getAuthenticatedUserId({
    requestContext: { authorizer: { claims: { sub: 'user-456' } } }
  }), 'user-456');
});

test('rejects missing or malformed identity claims', () => {
  assert.equal(getAuthenticatedUserId({}), null);
  assert.equal(getAuthenticatedUserId({ requestContext: { authorizer: { jwt: { claims: {} } } } }), null);
  assert.equal(getAuthenticatedUserId({ requestContext: { authorizer: { jwt: { claims: { sub: 42 } } } } }), null);
});
