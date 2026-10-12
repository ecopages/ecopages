import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './cli.js';
import * as giget from 'giget';
import * as fs from 'node:fs';
import * as launchPlan from './launch-plan.js';
import * as childProcess from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import * as prompts from '@clack/prompts';
import {
	ECOPAGES_DEV_RESTART_EXIT_CODE,
	ECOPAGES_DEV_RESTART_REASON_ENV,
} from '@ecopages/core/dev/development-restart';
import { DEVELOPMENT_RESTART_WATCH_SET_FILENAME } from '@ecopages/core/dev/development-restart-watch-paths';

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
		statSync: vi.fn(actual.statSync),
		watch: vi.fn(() => {
			const watcher = { close: vi.fn(), on: vi.fn(() => watcher) };
			return watcher;
		}),
	};
});

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
	});

	afterEach(() => {
		vi.mocked(childProcess.spawn).mockReset();
		vi.mocked(fs.statSync).mockReset();
		vi.mocked(fs.watch).mockReset();
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

	function getWatchListener() {
		return vi.mocked(fs.watch).mock.calls[0]?.[1] as unknown as (event: string, file: string) => void;
	}

	function createRestartWatchSetProject({ persistWatchSet = true } = {}) {
		const originalCwd = process.cwd();
		const rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eco-cli-restart-watch-set-')));
		const workspaceRoot = path.join(rootDir, 'linked-ui');
		const configPath = path.join(rootDir, 'eco.config.ts');
		const envPath = path.join(rootDir, '.env');
		const watchSetPath = path.join(rootDir, '.eco', DEVELOPMENT_RESTART_WATCH_SET_FILENAME);
		fs.mkdirSync(path.join(rootDir, '.eco'), { recursive: true });
		fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
		fs.writeFileSync(path.join(rootDir, 'app.ts'), 'export {}', 'utf8');
		fs.writeFileSync(configPath, 'export default {}', 'utf8');
		fs.writeFileSync(path.join(workspaceRoot, 'src', 'button.ts'), 'export const button = 1', 'utf8');
		const writeWatchSet = (additionalFiles: string[] = [], additionalRoots: string[] = []) => {
			fs.writeFileSync(
				watchSetPath,
				JSON.stringify({
					version: 1,
					cwd: rootDir,
					files: [configPath, envPath, ...additionalFiles],
					roots: [workspaceRoot, ...additionalRoots],
					ignoredDirectories: [path.join(rootDir, '.eco')],
				}),
			);
		};
		if (persistWatchSet) writeWatchSet();
		process.chdir(rootDir);
		vi.mocked(launchPlan.resolveEcoConfigFilePath).mockReturnValue(configPath);
		vi.mocked(fs.existsSync).mockImplementation((filePath) => {
			try {
				fs.lstatSync(String(filePath));
				return true;
			} catch {
				return false;
			}
		});

		return {
			rootDir,
			workspaceRoot,
			writeWatchSet,
			restore() {
				process.chdir(originalCwd);
				fs.rmSync(rootDir, { recursive: true, force: true });
				vi.mocked(launchPlan.resolveEcoConfigFilePath).mockReturnValue(undefined);
			},
		};
	}

	it('keeps a dev session alive when a restarted child fails, and relaunches on the next config change', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

		exitHandlers[1]?.(1);
		expect(exitSpy).not.toHaveBeenCalled();
		expect(fs.watch).toHaveBeenCalledWith(process.cwd(), expect.any(Function));

		const onWatchEvent = getWatchListener();
		const watcher = vi.mocked(fs.watch).mock.results[0]?.value as { close: () => void };
		onWatchEvent('change', 'app.ts');
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledTimes(2);

		onWatchEvent('change', 'eco.config.ts');
		expect(watcher.close).toHaveBeenCalled();
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));

		exitSpy.mockRestore();
	});

	it('waits for a config change when the launch plan fails during a restart', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
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
		await vi.waitFor(() => expect(fs.watch).toHaveBeenCalled());
		expect(exitSpy).not.toHaveBeenCalled();

		const onWatchEvent = getWatchListener();
		onWatchEvent('rename', '.env.local');
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

		exitSpy.mockRestore();
	});

	it('relaunches once when the same config change is reported twice', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));
		exitHandlers[1]?.(1);

		getWatchListener()('change', 'eco.config.ts');
		getWatchListener()('rename', 'eco.config.ts');
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledTimes(3);

		exitSpy.mockRestore();
	});

	it('relaunches at once when the config changed while the restarted child was loading', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		let configModifiedTime = 1;
		vi.mocked(fs.statSync).mockImplementation(((filePath: string) =>
			filePath.endsWith('eco.config.ts') ? { mtimeMs: configModifiedTime } : undefined) as never);

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

		configModifiedTime = 2;
		exitHandlers[1]?.(1);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));
		expect(fs.watch).not.toHaveBeenCalled();

		exitSpy.mockRestore();
	});

	it('watches the nearest existing directory when a restart input directory was removed', async () => {
		const project = createRestartWatchSetProject({ persistWatchSet: false });
		const missingDirectory = path.join(project.rootDir, 'lib', 'removed');
		const missingRoot = path.join(project.rootDir, 'packages', 'removed-ui');
		const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
		vi.mocked(fs.watch).mockImplementation(((watchPath: fs.PathLike) => {
			if (!actualFs.existsSync(watchPath)) {
				throw Object.assign(new Error(`ENOENT: no such file or directory, watch '${String(watchPath)}'`), {
					code: 'ENOENT',
				});
			}
			const watcher = { close: vi.fn(), on: vi.fn(() => watcher) };
			return watcher;
		}) as never);
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();

		try {
			await runCli(['dev']);
			project.writeWatchSet([path.join(missingDirectory, 'options.ts')], [missingRoot]);
			exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
			await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));
			exitHandlers[1]?.(1);

			await vi.waitFor(() => expect(fs.watch).toHaveBeenCalledWith(project.rootDir, expect.any(Function)));
			expect(exitSpy).not.toHaveBeenCalledWith(1);
			const listeners = vi
				.mocked(fs.watch)
				.mock.calls.filter(
					([watchPath, options]) => watchPath === project.rootDir && typeof options === 'function',
				)
				.map(([, listener]) => listener as unknown as (event: string, fileName: string) => void);
			for (const listener of listeners) listener('rename', 'lib');
			await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));
		} finally {
			exitSpy.mockRestore();
			project.restore();
		}
	});

	it('reloads persisted config imports written by a previous child before waiting after a failed restart', async () => {
		const project = createRestartWatchSetProject({ persistWatchSet: false });
		const importedConfigPath = path.join(project.rootDir, 'mdx-plugin-options.ts');
		fs.writeFileSync(importedConfigPath, 'export default {}', 'utf8');
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();

		try {
			await runCli(['dev']);
			project.writeWatchSet([importedConfigPath]);
			exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
			await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));
			exitHandlers[1]?.(1);

			await vi.waitFor(() => expect(fs.watch).toHaveBeenCalledWith(project.rootDir, expect.any(Function)));
			const configWatcher = vi
				.mocked(fs.watch)
				.mock.calls.find(
					([watchPath, options]) => watchPath === project.rootDir && typeof options === 'function',
				);
			const onConfigChange = configWatcher?.[1] as (event: string, fileName: string) => void;
			onConfigChange('change', path.basename(importedConfigPath));
			await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));
		} finally {
			exitSpy.mockRestore();
			project.restore();
		}
	});

	it('waits on newly persisted restart inputs without treating the new watch set as an edit', async () => {
		const project = createRestartWatchSetProject();
		const importedConfigPath = path.join(project.rootDir, 'mdx-plugin-options.ts');
		const linkedPackageRoot = path.join(project.rootDir, 'new-linked-package');
		fs.writeFileSync(importedConfigPath, 'export default {}', 'utf8');
		fs.mkdirSync(path.join(linkedPackageRoot, 'src'), { recursive: true });
		fs.writeFileSync(path.join(linkedPackageRoot, 'src', 'index.ts'), 'export {}', 'utf8');
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();

		try {
			await runCli(['dev']);
			exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
			await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

			project.writeWatchSet([importedConfigPath], [linkedPackageRoot]);
			exitHandlers[1]?.(1);
			await vi.waitFor(() => expect(fs.watch).toHaveBeenCalledWith(project.rootDir, expect.any(Function)));
			expect(fs.watch).toHaveBeenCalledWith(linkedPackageRoot, { recursive: true }, expect.any(Function));
			expect(exitHandlers).toHaveLength(2);

			const linkedPackageWatcher = vi
				.mocked(fs.watch)
				.mock.calls.find(
					([watchPath, options]) => watchPath === linkedPackageRoot && typeof options === 'object',
				);
			const onLinkedPackageChange = linkedPackageWatcher?.[2] as (event: string, fileName: string) => void;
			onLinkedPackageChange('change', path.join('src', 'index.ts'));
			await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));
		} finally {
			exitSpy.mockRestore();
			project.restore();
		}
	});

	it('watches linked workspace packages after a restarted child fails', async () => {
		const project = createRestartWatchSetProject();
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();

		try {
			await runCli(['dev']);
			exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
			await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));
			exitHandlers[1]?.(1);

			await vi.waitFor(() =>
				expect(fs.watch).toHaveBeenCalledWith(project.workspaceRoot, { recursive: true }, expect.any(Function)),
			);
			const workspaceWatcher = vi
				.mocked(fs.watch)
				.mock.calls.find(
					([watchPath, options]) => watchPath === project.workspaceRoot && typeof options === 'object',
				);
			const onWorkspaceChange = workspaceWatcher?.[2] as (event: string, fileName: string) => void;
			onWorkspaceChange('change', path.join('src', 'button.ts'));
			await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));
		} finally {
			exitSpy.mockRestore();
			project.restore();
		}
	});

	it('relaunches when a workspace file changes while the restarted child is loading', async () => {
		const project = createRestartWatchSetProject();
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		const workspaceFile = path.join(project.workspaceRoot, 'src', 'button.ts');

		try {
			await runCli(['dev']);
			exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
			await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

			fs.writeFileSync(workspaceFile, 'export const button = "changed"', 'utf8');
			exitHandlers[1]?.(1);
			await vi.waitFor(() => expect(exitHandlers).toHaveLength(3));
			expect(fs.watch).not.toHaveBeenCalled();
		} finally {
			exitSpy.mockRestore();
			project.restore();
		}
	});

	it('exits with a clear error when the restart files cannot be watched', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		vi.mocked(fs.watch).mockImplementationOnce(() => {
			throw Object.assign(new Error('ENOSPC: System limit for number of file watchers reached'), {
				code: 'ENOSPC',
			});
		});

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

		expect(() => exitHandlers[1]?.(1)).toThrow('process.exit:1');

		exitSpy.mockRestore();
	});

	it('keeps waiting when a restart file cannot be read', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();
		vi.mocked(fs.statSync).mockImplementation(() => {
			throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
		});

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

		exitHandlers[1]?.(1);
		expect(exitSpy).not.toHaveBeenCalled();
		expect(fs.watch).toHaveBeenCalled();

		exitSpy.mockRestore();
	});

	it.each([0, null])('exits when a restarted child exits with %s', async (code) => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();

		await runCli(['dev']);
		exitHandlers[0]?.(ECOPAGES_DEV_RESTART_EXIT_CODE);
		await vi.waitFor(() => expect(exitHandlers).toHaveLength(2));

		expect(() => exitHandlers[1]?.(code)).toThrow('process.exit:0');
		expect(fs.watch).not.toHaveBeenCalled();

		exitSpy.mockRestore();
	});

	it('exits when the first dev child fails', async () => {
		const exitSpy = mockProcessExit();
		const exitHandlers = mockSpawnedChildren();

		await runCli(['dev']);
		expect(() => exitHandlers[0]?.(1)).toThrow('process.exit:1');
		expect(fs.watch).not.toHaveBeenCalled();

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
