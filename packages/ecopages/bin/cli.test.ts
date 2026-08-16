import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './cli.js';
import * as giget from 'giget';
import * as fs from 'node:fs';
import * as launchPlan from './launch-plan.js';
import path from 'node:path';
import * as prompts from '@clack/prompts';

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

vi.mock('./launch-plan.js', () => ({
	createLaunchPlan: vi.fn(),
}));

vi.mock('node:child_process', () => ({
	spawn: vi.fn().mockImplementation(() => ({
		on: vi.fn(),
	})),
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
		for (const targetDir of ['my-new-project', 'my-dir', 'interactive-app', 'remote-app', 'failed-app']) {
			fs.rmSync(targetDir, { recursive: true, force: true });
		}
	});

	it('runs init command with default template and repo', async () => {
		await runCli(['init', 'my-new-project']);
		expect(giget.downloadTemplate).toHaveBeenCalledWith('github:ecopages/ecopages/templates/jsx#v0.2.0-rc.0', {
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
				'0.2.0-rc.0',
			]);
		}
	});

	it('runs init command with an official template', async () => {
		await runCli(['init', 'my-dir', '--template', 'lit-jsx']);
		expect(giget.downloadTemplate).toHaveBeenCalledWith('github:ecopages/ecopages/templates/lit-jsx#v0.2.0-rc.0', {
			dir: 'my-dir',
			force: true,
		});
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
				'github:ecopages/ecopages/templates/react#v0.2.0-rc.0',
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

	it('runs build command with custom entry file', async () => {
		await runCli(['build', '--entry-file', 'server.ts']);
		expect(launchPlan.createLaunchPlan).toHaveBeenCalledWith(
			['--build'],
			expect.objectContaining({ nodeEnv: 'production', entryFile: 'server.ts' }),
			'server.ts',
			'build',
		);
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
