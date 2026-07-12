import { describe, expect, it } from 'vitest';
import { DefaultHmrStrategy } from './default-hmr-strategy.ts';

describe('DefaultHmrStrategy', () => {
	it('matches all file types as a fallback', () => {
		const strategy = new DefaultHmrStrategy();

		expect(strategy.matches('/app/src/components/theme-toggle.tsx')).toBe(true);
		expect(strategy.matches('/app/src/styles/theme.css')).toBe(true);
	});
});
