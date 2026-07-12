import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { DefaultHmrStrategy } from './default-hmr-strategy.ts';

describe('DefaultHmrStrategy', () => {
	it('does not match declared client script entrypoints', () => {
		const strategy = new DefaultHmrStrategy();

		expect(strategy.matches(path.join('/app/src/components/theme-toggle.script.tsx'))).toBe(false);
	});

	it('matches other file types as a fallback', () => {
		const strategy = new DefaultHmrStrategy();

		expect(strategy.matches('/app/src/styles/theme.css')).toBe(true);
	});
});
