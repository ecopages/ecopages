import { describe, expect, it } from 'vitest';
import { withTimeout } from './run-a11y-checks.ts';

describe('withTimeout', () => {
	it('rejects when the promise does not settle in time', async () => {
		await expect(
			withTimeout(
				new Promise<void>(() => {
					/* never resolves */
				}),
				20,
				'test',
			),
		).rejects.toThrow('test-timeout');
	});

	it('resolves when the promise settles before the timeout', async () => {
		await expect(withTimeout(Promise.resolve('ok'), 50, 'test')).resolves.toBe('ok');
	});
});
