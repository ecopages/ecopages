/**
 * This module contains a simple utility invariant function that throws an error if the condition is not met
 * @module
 */

const prefix: string = '[ecopages]';

export function invariant(condition: any, message?: string): asserts condition {
  if (condition) {
    return;
  }

  const value: string = message ? `${prefix} ${message}` : `${prefix} An error occurred`;
  throw new Error(value);
}
