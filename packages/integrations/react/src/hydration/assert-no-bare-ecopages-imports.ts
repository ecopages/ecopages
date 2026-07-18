import { expect } from 'vitest';

/**
 * Test helper: assert generated hydration bootstrap source has no bare `@ecopages/*` imports.
 */
export function assertNoBareEcopagesImports(source: string): void {
	expect(source).not.toMatch(/from\s+["']@ecopages\//);
}
