import { describe, expect, it } from 'vitest';
import { buildProjectRuns, hasInteractivePassThroughFlags } from './run-e2e.mjs';

const kitchenSinkGlob = 'playground/kitchen-sink/e2e/**/*.test.e2e.ts';
const kitchenSinkStatefulSpec = 'playground/kitchen-sink/e2e/includes-hmr.test.e2e.ts';

describe('run-e2e wrapper planning', () => {
	it('keeps list-mode selections inside wrapper planning', () => {
		expect(hasInteractivePassThroughFlags(['--list'])).toBe(false);
		expect(hasInteractivePassThroughFlags(['--ui'])).toBe(true);
	});

	it('adds serial stateful kitchen-sink runs for glob selections', () => {
		const runs = buildProjectRuns([kitchenSinkGlob, '--list']);
		const statefulRuns = runs.filter((run) => run.env?.ECOPAGES_INCLUDE_STATEFUL_KITCHEN_SINK_TESTS === 'true');

		expect(statefulRuns).toHaveLength(4);

		for (const run of statefulRuns) {
			expect(run.args).toContain(kitchenSinkStatefulSpec);
			expect(run.args).not.toContain(kitchenSinkGlob);
			expect(run.args).toContain('--list');
		}
	});

	it('routes explicit stateful selections to serial kitchen-sink runs only', () => {
		const runs = buildProjectRuns([kitchenSinkStatefulSpec, '--list']);

		expect(runs).toHaveLength(4);

		for (const run of runs) {
			expect(run.env).toEqual({
				ECOPAGES_INCLUDE_STATEFUL_KITCHEN_SINK_TESTS: 'true',
			});
			expect(run.args[0]).toBe(kitchenSinkStatefulSpec);
			expect(run.args).toContain('--list');
		}
	});
});