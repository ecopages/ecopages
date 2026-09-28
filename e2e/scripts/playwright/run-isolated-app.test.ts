import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	buildCommand,
	buildEnv,
	parseArgs,
	prepareWorkspace,
	shouldExcludeFromWorkspaceCopy,
} from './run-isolated-app.mjs';

describe('run-isolated-app launcher', () => {
	it('parses required launcher flags and defaults artifactScope to workspace', () => {
		expect(
			parseArgs(['--sourceDir', 'playground/kitchen-sink', '--workspace', 'kitchen-sink-bun', '--port', '4010']),
		).toEqual({
			artifactScope: 'kitchen-sink-bun',
			host: 'ecopages',
			mode: 'dev',
			port: 4010,
			runtime: 'bun',
			sourceDir: 'playground/kitchen-sink',
			workspace: 'kitchen-sink-bun',
		});
	});

	it('rejects missing required launcher arguments', () => {
		expect(() => parseArgs(['--workspace', 'only-workspace'])).toThrow(
			'Missing required isolated Playwright app launcher arguments.',
		);
	});

	it('rejects vite preview combinations', () => {
		expect(() =>
			parseArgs([
				'--sourceDir',
				'playground/kitchen-sink',
				'--workspace',
				'vite-preview',
				'--port',
				'4011',
				'--host',
				'vite',
				'--mode',
				'preview',
			]),
		).toThrow('Vite isolated Playwright servers only support dev mode.');
	});

	it('rejects invalid ports', () => {
		expect(() =>
			parseArgs(['--sourceDir', 'playground/kitchen-sink', '--workspace', 'kitchen-sink', '--port', '0']),
		).toThrow('Invalid isolated app port: 0');
	});

	it('excludes scoped artifact directories from workspace copies', () => {
		expect(shouldExcludeFromWorkspaceCopy('dist')).toBe(true);
		expect(shouldExcludeFromWorkspaceCopy('dist-bun-dev')).toBe(true);
		expect(shouldExcludeFromWorkspaceCopy('.eco')).toBe(true);
		expect(shouldExcludeFromWorkspaceCopy('.eco-vite-node-dev')).toBe(true);
		expect(shouldExcludeFromWorkspaceCopy('node_modules')).toBe(true);
		expect(shouldExcludeFromWorkspaceCopy('src/pages/index.kita.tsx')).toBe(false);
	});

	it('runs preview without a redundant build step', () => {
		const command = buildCommand({
			host: 'ecopages',
			mode: 'preview',
			port: 4008,
			runtime: 'bun',
		});

		expect(command).not.toContain(' build ');
		expect(command).not.toContain('&&');
		expect(command).toContain('preview --runtime bun --port 4008');
	});

	it('starts dev servers directly', () => {
		expect(
			buildCommand({
				host: 'ecopages',
				mode: 'dev',
				port: 4007,
				runtime: 'node',
			}),
		).toContain('dev --runtime node --port 4007');
	});

	it('sets ECOPAGES_BASE_URL to the active Vite port for vite host runs', () => {
		expect(
			buildEnv({
				host: 'vite',
				mode: 'dev',
				port: 4012,
				artifactScope: 'cross-integration-vite-node-parity',
			}).ECOPAGES_BASE_URL,
		).toBe('http://localhost:4012');
	});

	it('reuses an already-prepared shared workspace', () => {
		const root = mkdtempSync(join(tmpdir(), 'eco-isolated-'));
		const sourceDir = join(root, 'source');
		const workspaceDir = join(root, 'workspace');
		const previousValue = process.env.ECOPAGES_MANAGE_ISOLATED_WORKSPACES;

		mkdirSync(sourceDir, { recursive: true });
		writeFileSync(join(sourceDir, 'eco.config.ts'), 'export default {};\n');
		process.env.ECOPAGES_MANAGE_ISOLATED_WORKSPACES = 'true';

		try {
			prepareWorkspace(sourceDir, workspaceDir);
			writeFileSync(join(workspaceDir, 'marker.txt'), 'ready');
			prepareWorkspace(sourceDir, workspaceDir);
			expect(existsSync(join(workspaceDir, 'marker.txt'))).toBe(true);
		} finally {
			if (previousValue === undefined) {
				delete process.env.ECOPAGES_MANAGE_ISOLATED_WORKSPACES;
			} else {
				process.env.ECOPAGES_MANAGE_ISOLATED_WORKSPACES = previousValue;
			}

			rmSync(root, { recursive: true, force: true });
		}
	});
});
