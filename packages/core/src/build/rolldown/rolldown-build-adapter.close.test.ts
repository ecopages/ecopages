import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RolldownBuildAdapter } from './rolldown-build-adapter.ts';

const bundles = vi.hoisted(() => [] as Array<{ close: () => Promise<void> }>);

vi.mock('rolldown', async (importOriginal) => {
	const actual = await importOriginal<typeof import('rolldown')>();
	return {
		...actual,
		rolldown: async (options: Parameters<typeof actual.rolldown>[0]) => {
			const bundle = await actual.rolldown(options);
			vi.spyOn(bundle, 'close');
			bundles.push(bundle);
			return bundle;
		},
	};
});

describe('RolldownBuildAdapter bundle lifetime', () => {
	let workDir: string;

	beforeEach(() => {
		bundles.length = 0;
		workDir = mkdtempSync(path.join(tmpdir(), 'rolldown-close-test-'));
	});

	afterEach(() => {
		rmSync(workDir, { recursive: true, force: true });
	});

	it('closes the bundle after a successful build', async () => {
		const entrypoint = path.join(workDir, 'entry.ts');
		writeFileSync(entrypoint, 'export const value = 1;');

		const result = await new RolldownBuildAdapter().build({
			environment: 'server',
			entrypoints: [entrypoint],
			outdir: path.join(workDir, 'dist'),
			root: workDir,
		});

		expect(result.success).toBe(true);
		expect(bundles[0]!.close).toHaveBeenCalledTimes(1);
	});

	it('closes the bundle when writing its output fails', async () => {
		const entrypoint = path.join(workDir, 'entry.ts');
		const blocker = path.join(workDir, 'blocker');
		writeFileSync(entrypoint, 'export const value = 1;');
		writeFileSync(blocker, 'a file where the output folder should go');

		const result = await new RolldownBuildAdapter().build({
			environment: 'server',
			entrypoints: [entrypoint],
			outdir: path.join(blocker, 'dist'),
			root: workDir,
		});

		expect(result.success).toBe(false);
		expect(bundles[0]!.close).toHaveBeenCalledTimes(1);
	});
});
