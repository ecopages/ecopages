import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runCommand } from 'citty';
import { mainCommand } from './cli.js';
import * as giget from 'giget';
import * as fs from 'node:fs';
import * as launchPlan from './launch-plan.js';

vi.mock('giget', () => ({
	downloadTemplate: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return {
		...actual,
		existsSync: vi.fn((path) => actual.existsSync(path)),
		writeFileSync: vi.fn(),
	};
});

vi.mock('./launch-plan.js', () => ({
	createLaunchPlan: vi.fn(),
	launchPlanRequiresExistingEntryFile: vi.fn(),
}));

vi.mock('node:child_process', () => ({
	spawn: vi.fn().mockImplementation(() => ({
		on: vi.fn(),
	})),
}));

vi.mock('@ecopages/logger', () => ({
	Logger: class {
		info = vi.fn();
		error = vi.fn();
	},
}));

describe('CLI Commands', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default mocks
		vi.mocked(fs.existsSync).mockReturnValue(false); // pretend no existing dir
		vi.mocked(launchPlan.createLaunchPlan).mockResolvedValue({
			runtime: 'node',
			command: 'node',
			commandArgs: [],
			envOverrides: {},
			env: {},
		} as any);
		vi.mocked(launchPlan.launchPlanRequiresExistingEntryFile).mockReturnValue(false);
	});

	it('runs init command with default template and repo', async () => {
		await runCommand(mainCommand, { rawArgs: ['init', 'my-new-project'] });
		expect(giget.downloadTemplate).toHaveBeenCalledWith('github:ecopages/ecopages/examples/starter-jsx', {
			dir: 'my-new-project',
			force: true,
		});
	});

	it('runs init command with custom template and repo', async () => {
		await runCommand(mainCommand, {
			rawArgs: ['init', 'my-dir', '--template', 'starter-lit', '--repo', 'custom/repo'],
		});
		expect(giget.downloadTemplate).toHaveBeenCalledWith('github:custom/repo/examples/starter-lit', {
			dir: 'my-dir',
			force: true,
		});
	});

	it('runs dev command and passes defaults to launch plan', async () => {
		await runCommand(mainCommand, { rawArgs: ['dev'] });
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--dev'],
			expect.objectContaining({ nodeEnv: 'development' }),
			'app.ts',
		);
	});

	it('runs dev:hot command', async () => {
		await runCommand(mainCommand, { rawArgs: ['dev:hot'] });
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--dev'],
			expect.objectContaining({ hot: true, nodeEnv: 'development' }),
			'app.ts',
		);
	});

	it('runs dev:watch command', async () => {
		await runCommand(mainCommand, { rawArgs: ['dev:watch'] });
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--dev'],
			expect.objectContaining({ watch: true, nodeEnv: 'development' }),
			'app.ts',
		);
	});

	it('runs build command with custom entry file', async () => {
		await runCommand(mainCommand, { rawArgs: ['build', 'server.ts'] });
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--build'],
			expect.objectContaining({ nodeEnv: 'production' }),
			'server.ts',
		);
	});

	it('passes shared server options like port and hostname correctly', async () => {
		await runCommand(mainCommand, { rawArgs: ['start', '-p', '4000', '--hostname', '0.0.0.0'] });
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			[],
			expect.objectContaining({
				nodeEnv: 'production',
				port: '4000',
				hostname: '0.0.0.0',
			}),
			'app.ts',
		);
	});

	it('allows overriding base url and debug options', async () => {
		await runCommand(mainCommand, { rawArgs: ['preview', '--base-url', '/my-app/', '-d'] });
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--preview'],
			expect.objectContaining({
				nodeEnv: 'production',
				'base-url': '/my-app/',
				debug: true,
			}),
			'app.ts',
		);
	});
});
