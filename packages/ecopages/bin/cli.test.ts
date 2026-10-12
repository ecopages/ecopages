import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './cli.js';
import * as giget from 'giget';
import * as fs from 'node:fs';
import * as launchPlan from './launch-plan.js';
import * as childProcess from 'node:child_process';
import path from 'node:path';
import * as prompts from '@clack/prompts';
import {
	ECOPAGES_DEV_RESTART_EXIT_CODE,
	ECOPAGES_DEV_RESTART_REASON_ENV,
	resolveDevelopmentRecoveryWatch,
} from '@ecopages/core/dev/development-restart';
import { fileSystem, type WatchOptions } from '@ecopages/file-system';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const cliVersionTag = `v${pkg.version}`;

vi.mock('giget', () => ({
	downloadTemplate: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
	log: { step: vi.fn() },
	isCancel: vi.fn(() => false),
	cancel: vi.fn(),
	text: vi.fn(),
	select: vi.fn(),
	confirm: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return {
		...actual,
		existsSync: vi.fn((path) => actual.existsSync(path)),
		writeFileSync: actual.writeFileSync,
	};
});

vi.mock('@ecopages/file-system', () => ({
	fileSystem: { watch: vi.fn() },
}));

vi.mock('@ecopages/core/dev/development-restart', async (importOriginal) => ({
	...(await importOriginal<typeof import('@ecopages/core/dev/development-restart')>()),
	resolveDevelopmentRecoveryWatch: vi.fn(),
}));

vi.mock('./launch-plan.js', () => ({
	createLaunchPlan: vi.fn(),
	resolveEcoConfigFilePath: vi.fn(() => undefined),
}));

vi.mock('node:child_process', () => ({
	spawn: vi.fn(() => ({ on: vi.fn() })),
}));

vi.mock('@ecopages/logger', () => ({
	Logger: class {
		info = vi.fn();
		warn = vi.fn();
		error = vi.fn();
		debug = vi.fn();
	},
}));

describe('CLI Commands', () => {
	function mockProcessExit() {
		return vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
			throw new Error(`process.exit:${code ?? ''}`);
		}) as never);
	}

	beforeEach(() => {
		vi.clearAllMocks();

		vi.mocked(fs.existsSync).mockImplementation(
			(filePath) =>
				filePath === 'app.ts' || filePath === 'server.ts' || String(filePath).endsWith('package.json'),
		);
		vi.mocked(giget.downloadTemplate).mockImplementation(async (_source, options) => {
			const targetDir = String(options?.dir);
			fs.mkdirSync(targetDir, { recursive: true });
			fs.writeFileSync(
				path.join(targetDir, 'package.json'),
				'{"name":"template","dependencies":{"runtime":"workspace:*"},"devDependencies":{"ecopages":"workspace:*"},"peerDependencies":{"peer":"workspace:*"},"optionalDependencies":{"optional":"workspace:*"}}\n',
			);
			return { dir: targetDir, source: String(_source) } as never;
		});
		vi.mocked(launchPlan.createLaunchPlan).mockResolvedValue({
			runtime: 'node',
			command: 'node',
			commandArgs: [],
			envOverrides: {},
			env: {},
		} as any);
		mockProjectWatches();
	});

	afterEach(() => {
		vi.mocked(childProcess.spawn).mockReset();
		vi.mocked(fileSystem.watch).mockReset();
		for (const targetDir of ['my-new-project', 'my-dir', 'interactive-app', 'remote-app', 'failed-app']) {
			fs.rmSync(targetDir, { recursive: true, force: true });
		}
	});

	it('runs init command with default template and repo', async () => {
		await runCli(['init', 'my-new-project']);
		expect(giget.downloadTemplate).toHaveBeenCalledWith(`github:ecopages/ecopages/templates/jsx#${cliVersionTag}`, {
			dir: 'my-new-project',
			force: true,
		});
		const generatedManifest = JSON.parse(fs.readFileSync('my-new-project/package.json', 'utf8')) as Record<
			string,
			unknown
		>;
		expect(generatedManifest.name).toBe('my-new-project');
		for (const blockName of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
			expect(Object.values((generatedManifest[blockName] ?? {}) as Record<string, string>)).toEqual([
				pkg.version,
			]);
		}
	});

	it('runs init command with an official template', async () => {
		await runCli(['init', 'my-dir', '--template', 'lit-jsx']);
		expect(giget.downloadTemplate).toHaveBeenCalledWith(
			`github:ecopages/ecopages/templates/lit-jsx#${cliVersionTag}`,
			{
				dir: 'my-dir',
				force: true,
			},
		);
	});

	it('runs the interactive init flow when no directory is provided', async () => {
		const originalTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
		Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
		vi.mocked(prompts.text)
			.mockResolvedValueOnce('interactive-app' as never)
			.mockResolvedValueOnce('github:custom/template#v1.0.0' as never);
		vi.mocked(prompts.select).mockResolvedValueOnce('react' as never);
		vi.mocked(prompts.confirm).mockResolvedValueOnce(false as never);

		try {
			await runCli(['init']);

			expect(giget.downloadTemplate).toHaveBeenCalledWith(
				`github:ecopages/ecopages/templates/react#${cliVersionTag}`,
				{
					dir: 'interactive-app',
					force: true,
				},
			);
		} finally {
			if (originalTtyDescriptor) Object.defineProperty(process.stdin, 'isTTY', originalTtyDescriptor);
			else Reflect.deleteProperty(process.stdin, 'isTTY');
		}
	});

	it('normalizes a GitHub community source without rewriting its dependencies', async () => {
		await runCli(['init', 'remote-app', '--from', 'https://github.com/custom/template/tree/main/site']);

		expect(giget.downloadTemplate).toHaveBeenCalledWith('github:custom/template/site#main', {
			dir: 'remote-app',
			force: true,
		});
	});

	it('rejects conflicting template sources and the removed repo option', async () => {
		const exitSpy = mockProcessExit();

		await expect(
			runCli(['init', 'conflict-app', '--template', 'react', '--from', 'github:owner/repo']),
		).rejects.toThrow('process.exit:1');
		await expect(runCli(['init', 'legacy-app', '--repo', 'owner/repo'])).rejects.toThrow('process.exit:1');

		exitSpy.mockRestore();
	});

	it('requires a directory for non-interactive init', async () => {
		const exitSpy = mockProcessExit();

		await expect(runCli(['init', '--no-interactive'])).rejects.toThrow('process.exit:1');

		exitSpy.mockRestore();
	});

	it('cleans up a partial target when community download fails', async () => {
		const exitSpy = mockProcessExit();
		vi.mocked(giget.downloadTemplate).mockImplementationOnce(async (_source, options) => {
			const targetDir = String(options?.dir);
			fs.mkdirSync(targetDir, { recursive: true });
			throw new Error('download failed');
		});

		await expect(runCli(['init', 'failed-app', '--from', 'github:owner/repo'])).rejects.toThrow('process.exit:1');
		expect(fs.existsSync('failed-app')).toBe(false);

		exitSpy.mockRestore();
	});

	it('runs dev command and passes defaults to launch plan', async () => {
		await runCli(['dev']);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--dev'],
			expect.objectContaining({ nodeEnv: 'development' }),
			'app.ts',
			'dev',
		);
	});

	it('respawns supervised dev children after a restart request', async () => {
		const childHandlers = new Map<string, (...args: unknown[]) => void>();
		vi.mocked(childProcess.spawn).mockReturnValueOnce({
			on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				childHandlers.set(event, handler);
			}),
		} as never);
		vi.mocked(launchPlan.createLaunchPlan)
			.mockResolvedValueOnce({
				runtime: 'node',
				command: 'node',
				commandArgs: [],
				envOverrides: {},
				env: {},
			} as never)
			.mockResolvedValueOnce({
				runtime: 'node',
				command: 'node',
				commandArgs: [],
				envOverrides: {},
				env: {},
			} as never);

		await runCli(['dev']);
		childHandlers.get('exit')?.(ECOPAGES_DEV_RESTART_EXIT_CODE);

		await vi.waitFor(() => expect(launchPlan.createLaunchPlan).toHaveBeenCalledTimes(2));
		const restartedPlan = await vi.mocked(launchPlan.createLaunchPlan).mock.results[1]?.value;
		expect(restartedPlan.env[ECOPAGES_DEV_RESTART_REASON_ENV]).toBe('configuration or environment change');
	});

	function mockSpawnedChildren() {
		const exitHandlers: Array<(code: number | null) => void> = [];
		vi.mocked(childProcess.spawn).mockImplementation(
			() =>
				({
					on: vi.fn((event: string, handler: (code: number | null) => void) => {
						if (event === 'exit') exitHandlers.push(handler);
					}),
				}) as never,
		);
		return exitHandlers;
	}

	const recoveryWatch = { paths: ['/project', '/workspace/linked-ui'], ignored: () => false };

	function mockProjectWatches() {
		const watches: Array<{ paths: readonly string[]; options: WatchOptions; close: ReturnType<typeof vi.fn> }> = [];
		vi.mocked(resolveDevelopmentRecoveryWatch).mockReturnValue(recoveryWatch);
		vi.mocked(fileSystem.watch).mockImplementation((paths, options) => {
			const close = vi.fn(async () => {});
			watches.push({ paths, options, close });
			return { ready: Promise.resolve(), close };
		});
		return watches;
	}

	function changeProjectFile(watch: { options: WatchOptions } | undefined) {
		watch?.options.onChange({ type: 'change', path: '/project/src/lib/options.ts' });
	}

	it('keeps a dev session alive when a restarted child fails, and relaunches on the next project change', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		const watches = mockProjectWatches();

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));
		expect(watches).toHaveLength(1);
		expect(watches[0]?.paths).toEqual(recoveryWatch.paths);
		expect(watches[0]?.options.ignored).toBe(recoveryWatch.ignored);

		exitHandlers[1]?.(1);
		expect(exitSpy).not.toHaveBeenCalled();
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledTimes(2);

		changeProjectFile(watches[0]);
		expect(watches[0]?.close).toHaveBeenCalled();
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));

		exitSpy.mockRestore();
	});

	it('waits for a project change when the launch plan fails during a restart', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		const watches = mockProjectWatches();
		vi.mocked(launchPlan.createLaunchPlan)
			.mockResolvedValueOnce({
				runtime: 'node',
				command: 'node',
				commandArgs: [],
				envOverrides: {},
				env: {},
			} as never)
			.mockRejectedValueOnce(new Error('invalid config'));

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(launchPlan.createLaunchPlan).toHaveBeenCalledTimes(2));
		expect(exitSpy).not.toHaveBeenCalled();

		changeProjectFile(watches[0]);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

		exitSpy.mockRestore();
	});

	it('relaunches once when one save is reported twice', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		const watches = mockProjectWatches();

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));
		exitHandlers[1]?.(1);

		changeProjectFile(watches[0]);
		changeProjectFile(watches[0]);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledTimes(3);

		exitSpy.mockRestore();
	});

	it('relaunches at once when the project changed while the restarted child was loading', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		const watches = mockProjectWatches();

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

		changeProjectFile(watches[0]);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledTimes(2);
		exitHandlers[1]?.(1);

		expect(watches[0]?.close).toHaveBeenCalled();
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));

		exitSpy.mockRestore();
	});

	it('stops watching the project when a restarted child requests another restart', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		const watches = mockProjectWatches();

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));
		exitHandlers[1]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);

		await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));
		expect(watches[0]?.close).toHaveBeenCalled();
		expect(watches).toHaveLength(2);

		exitSpy.mockRestore();
	});

	it('exits with a clear error when the project cannot be watched', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		const watches = mockProjectWatches();

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(watches).toHaveLength(1));

		expect(() =>
			watches[0]?.options.onError(
				Object.assign(new Error('ENOSPC: System limit for number of file watchers reached'), {
					code: 'ENOSPC',
				}),
			),
		).toThrow('process.exit:1');

		exitSpy.mockRestore();
	});

	it.each([0, null])('exits when a restarted child exits with %s', async (code) => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		mockProjectWatches();

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

		expect(() => exitHandlers[1]?.(code)).toThrow('process.exit:0');

		exitSpy.mockRestore();
	});

	it('exits when the first dev child fails, without watching the project', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		mockProjectWatches();

		await runCli(['dev']);
		expect(() => exitHandlers[0]?.(1)).toThrow('process.exit:1');
		expect(fileSystem.watch).not.toHaveBeenCalled();

		exitSpy.mockRestore();
	});

	it('runs dev:hot command', async () => {
		await runCli(['dev:hot']);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--dev'],
			expect.objectContaining({ hot: true, nodeEnv: 'development' }),
			'app.ts',
			'dev',
		);
	});

	it('runs dev:watch command', async () => {
		await runCli(['dev:watch']);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--dev'],
			expect.objectContaining({ watch: true, nodeEnv: 'development' }),
			'app.ts',
			'dev',
		);
	});

	it('runs the types command on the core config entry, never the app entry', async () => {
		vi.mocked(fs.existsSync).mockImplementation((filePath) => String(filePath).endsWith('write-types.ts'));
		await runCli(['types', '--config', 'eco.staging.ts']);
		const [args, options, entry, launchMode] = vi.mocked(launchPlan.createLaunchPlan).mock.calls.at(-1)!;

		expect(args).toEqual([]);
		expect(entry).toMatch(/core\/src\/config\/write-types\.ts$/);
		expect(options).toMatchObject({ nodeEnv: 'production', entryFile: entry, configFile: 'eco.staging.ts' });
		expect(launchMode).toBe('types');
	});

	it('runs build command with custom entry file', async () => {
		await runCli(['build', '--entry-file', 'server.ts']);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--build'],
			expect.objectContaining({ nodeEnv: 'production', entryFile: 'server.ts' }),
			'server.ts',
			'build',
		);
	});

	it.each([
		['build', '--build'],
		['preview', '--preview'],
	])('forwards --force to %s', async (command, entryArg) => {
		await runCli([command, '--force']);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			[entryArg, '--force'],
			expect.objectContaining({ nodeEnv: 'production' }),
			'app.ts',
			command,
		);
	});

	it('rejects --force for commands that do not build', async () => {
		const exitSpy = mockProcessExit();

		await expect(runCli(['start', '--force'])).rejects.toThrow('process.exit:1');
		expect(launchPlan.createLaunchPlan).not.toHaveBeenCalled();

		exitSpy.mockRestore();
	});

	it('passes shared build options like base url and hostname correctly', async () => {
		await runCli(['build', '--base-url', '/docs/', '--hostname', '127.0.0.1']);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--build'],
			expect.objectContaining({
				nodeEnv: 'production',
				baseUrl: '/docs/',
				hostname: '127.0.0.1',
			}),
			'app.ts',
			'build',
		);
	});

	it('passes shared server options like port and hostname correctly', async () => {
		await runCli(['start', '-p', '4000', '--hostname', '0.0.0.0']);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			[],
			expect.objectContaining({
				nodeEnv: 'production',
				port: '4000',
				hostname: '0.0.0.0',
			}),
			'app.ts',
			'start',
		);
	});

	it('allows overriding base url and debug options', async () => {
		await runCli(['preview', '--base-url', '/my-app/', '-d']);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--preview'],
			expect.objectContaining({
				nodeEnv: 'production',
				baseUrl: '/my-app/',
				debug: true,
			}),
			'app.ts',
			'preview',
		);
	});

	it('normalizes react fast refresh to the launch-plan option shape', async () => {
		await runCli(['dev', '--react-fast-refresh', '--runtime', 'bun']);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--dev'],
			expect.objectContaining({
				nodeEnv: 'development',
				reactFastRefresh: true,
				runtime: 'bun',
			}),
			'app.ts',
			'dev',
		);
	});

	it('rejects positional entry file arguments loudly', async () => {
		const exitSpy = mockProcessExit();

		await expect(runCli(['build', 'server.ts'])).rejects.toThrow('process.exit:1');
		expect(launchPlan.createLaunchPlan).not.toHaveBeenCalled();

		exitSpy.mockRestore();
	});
});
