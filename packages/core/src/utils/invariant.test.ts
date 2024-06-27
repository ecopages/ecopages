import { describe, expect, test } from 'bun:test';
import { invariant } from './invariant';

describe('invariant', () => {
  test('should not throw an error when the condition is true', () => {
    expect(() => {
      invariant(true);
    }).not.toThrow();
  });

  test('should throw an error with the default message when the condition is false', () => {
    expect(() => {
      invariant(false);
    }).toThrowError('[ecopages] An error occurred');
  });

  test('should throw an error with the provided message when the condition is false', () => {
    expect(() => {
      invariant(false, 'Custom error message');
    }).toThrowError('[ecopages] Custom error message');
  });
});
