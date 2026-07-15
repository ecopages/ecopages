import { describe, expect, test } from 'vitest';
import { shouldSuppressRolldownLog } from './rolldown-adapter-helpers.ts';

describe('shouldSuppressRolldownLog', () => {
	test('suppresses expected node builtin unresolved-import warnings', () => {
		expect(
			shouldSuppressRolldownLog({
				code: 'UNRESOLVED_IMPORT',
				id: 'node:fs',
				message: "Could not resolve 'node:fs'",
			}),
		).toBe(true);

		expect(
			shouldSuppressRolldownLog({
				code: 'UNRESOLVED_IMPORT',
				message: "Could not resolve 'node:fs/promises' in ./file.ts",
			}),
		).toBe(true);
	});

	test('keeps unrelated warnings visible', () => {
		expect(
			shouldSuppressRolldownLog({
				code: 'UNRESOLVED_IMPORT',
				id: 'missing-pkg',
				message: "Could not resolve 'missing-pkg'",
			}),
		).toBe(false);

		expect(
			shouldSuppressRolldownLog({
				code: 'CIRCULAR_DEPENDENCY',
				message: 'cycle detected',
			}),
		).toBe(false);
	});
});
