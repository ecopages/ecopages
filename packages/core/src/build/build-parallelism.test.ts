import { describe, expect, it } from 'vitest';
import { resolveBuildParallelism } from './build-parallelism.ts';

describe('resolveBuildParallelism', () => {
	it.each([
		{ availableCores: 1, expected: 1 },
		{ availableCores: 2, expected: 1 },
		{ availableCores: 8, expected: 7 },
	])('uses all but one available core, with a minimum of one worker', ({ availableCores, expected }) => {
		expect(resolveBuildParallelism(availableCores)).toBe(expected);
	});
});
