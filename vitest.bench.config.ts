/**
 * Vitest `bench` project — kitchen-sink performance suites only.
 *
 * Kept separate from `shared-core` so `pnpm test:vitest` never picks up
 * `*.bench.ts` files. Run via `pnpm test:bench` (`--project bench`).
 */
import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'bench',
		environment: 'node',
		include: ['playground/kitchen-sink/bench/**/*.bench.ts'],
	},
});
