import { describe, expect, it } from 'vitest';
import { buildPlaywrightArgs, parseArgs } from './run-kitchen-sink-e2e.mjs';

describe('run-kitchen-sink-e2e', () => {
	it('uses explicit project groups and strips a leading pnpm separator', () => {
		expect(parseArgs(['dev', '--', '-g', 'hmr'])).toEqual({
			group: 'dev',
			forwardedArgs: ['-g', 'hmr'],
		});
	});

	it('treats unknown positional args as Playwright selectors', () => {
		expect(parseArgs(['playground/kitchen-sink/e2e/includes-hmr.test.e2e.ts', '--list'])).toEqual({
			group: 'all',
			forwardedArgs: ['playground/kitchen-sink/e2e/includes-hmr.test.e2e.ts', '--list'],
		});
	});

	it('builds playwright args with config and grouped projects', () => {
		const args = buildPlaywrightArgs('preview', ['-g', 'preview']);

		expect(args).toContain('--config');
		expect(args).toContain('-g');
		expect(args).toContain('preview');
		expect(args).toContain('kitchen-sink-bun-preview-e2e');
		expect(args).toContain('kitchen-sink-node-preview-e2e');
	});

	it('places positional selectors before injected project flags', () => {
		const args = buildPlaywrightArgs('all', ['playground/kitchen-sink/e2e/includes-hmr.test.e2e.ts', '--list']);
		const selectorIndex = args.indexOf('playground/kitchen-sink/e2e/includes-hmr.test.e2e.ts');
		const firstProjectIndex = args.indexOf('--project');

		expect(selectorIndex).toBeGreaterThan(-1);
		expect(firstProjectIndex).toBeGreaterThan(-1);
		expect(selectorIndex).toBeLessThan(firstProjectIndex);
	});
});
