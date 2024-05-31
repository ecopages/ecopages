import { describe, expect, test } from 'bun:test';
import { invariant } from '../utils/invariant';

describe('Utils', () => {
  test('invariant should throw error when condition is falsy', () => {
    expect(() => invariant(false, 'Test error')).toThrowError('[ecopages] Test error');
  });

  test('invariant should not throw error when condition is truthy', () => {
    expect(() => invariant(true, 'Test error')).not.toThrow();
  });
});
