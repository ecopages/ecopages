import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTRY_COMMAND_FLAGS } from './entry-command-flags.ts';
import { isProductionExportCommand, parseCliArgs } from './parse-cli-args.ts';
import { isDevelopmentRuntime, isProductionRuntime } from './runtime.ts';

const originalArgv = [...process.argv];

describe('parseCliArgs', () => {
	afterEach(() => {
		process.argv = [...originalArgv];
	});

	it.each(['true', '1'])('parses preview serve-only from env value %s', (value) => {
		vi.stubEnv('NODE_ENV', undefined);
		vi.stubEnv('ECOPAGES_PREVIEW_SERVE_ONLY', value);
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'preview'];

		expect(parseCliArgs()).toMatchObject({
			preview: true,
			serveOnly: true,
		});
	});

	it.each(['dev', 'build', 'preview'])('does not also report start for the %s subcommand', (command) => {
		process.argv = ['node', '/usr/local/bin/ecopages.js', command];

		expect(parseCliArgs()).toMatchObject({ start: false, [command]: true });
	});

	it('starts when the entry runs without a command or flag', () => {
		process.argv = ['node', '/app/app.ts'];

		expect(parseCliArgs()).toMatchObject({ start: true, dev: false, build: false, preview: false });
	});

	it('forces production NODE_ENV for build when ambient env is development', () => {
		vi.stubEnv('NODE_ENV', 'development');
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'build'];

		expect(parseCliArgs()).toMatchObject({
			build: true,
			dev: false,
		});
		expect(isProductionRuntime()).toBe(true);
	});

	it('parses the keep-going build option', () => {
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'build', '--keep-going'];

		expect(parseCliArgs()).toMatchObject({ build: true, keepGoing: true });
	});

	it.each(Object.keys(ENTRY_COMMAND_FLAGS))('parses the declared entry flag --%s', (flag) => {
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'build', `--${flag}`];

		expect(() => parseCliArgs()).not.toThrow();
	});

	it('parses the serve-only preview option', () => {
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'preview', '--serve-only'];

		expect(parseCliArgs()).toMatchObject({ preview: true, serveOnly: true });
	});

	it('keeps development NODE_ENV for dev commands', () => {
		vi.stubEnv('NODE_ENV', 'development');
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'dev'];

		expect(parseCliArgs()).toMatchObject({
			dev: true,
		});
		expect(isDevelopmentRuntime()).toBe(true);
	});

	it('forces production NODE_ENV for preview when ambient env is development', () => {
		vi.stubEnv('NODE_ENV', 'development');
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'preview'];

		expect(parseCliArgs()).toMatchObject({
			preview: true,
			dev: false,
		});
		expect(isProductionRuntime()).toBe(true);
	});

	it('forces production NODE_ENV for start when ambient env is development', () => {
		vi.stubEnv('NODE_ENV', 'development');
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'start'];

		expect(parseCliArgs()).toMatchObject({
			start: true,
			dev: false,
		});
		expect(isProductionRuntime()).toBe(true);
	});

	it('defaults to start when the bin is present without a subcommand', () => {
		vi.stubEnv('NODE_ENV', undefined);
		process.argv = ['node', '/usr/local/bin/ecopages.js'];

		expect(parseCliArgs()).toMatchObject({
			start: true,
			dev: false,
			build: false,
			preview: false,
		});
		expect(isProductionRuntime()).toBe(true);
	});

	it('parses port and hostname flags', () => {
		vi.stubEnv('NODE_ENV', undefined);
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'dev', '--port', '4321', '--hostname', '127.0.0.1'];

		expect(parseCliArgs()).toMatchObject({
			dev: true,
			port: 4321,
			hostname: '127.0.0.1',
		});
	});
});

describe('isProductionExportCommand', () => {
	afterEach(() => {
		process.argv = [...originalArgv];
		vi.unstubAllEnvs();
	});

	it.each([
		[['node', '/app/app.ts', '--build'], true],
		[['node', '/app/app.ts', '--preview'], true],
		[['node', '/usr/local/bin/ecopages.js', 'build'], true],
		[['node', '/app/app.ts', '--preview', '--serve-only'], false],
		[['node', '/app/app.ts', '--dev'], false],
		[['node', '/app/app.ts'], false],
		[['node', '/repo/node_modules/vitest/vitest.mjs', 'run', '--project', 'shared-core'], false],
	])('reads %j as a production export: %s', (argv, expected) => {
		process.argv = argv;

		expect(isProductionExportCommand()).toBe(expected);
	});

	it('does not count a serve-only preview from the environment', () => {
		vi.stubEnv('ECOPAGES_PREVIEW_SERVE_ONLY', 'true');
		process.argv = ['node', '/app/app.ts', '--preview'];

		expect(isProductionExportCommand()).toBe(false);
	});
});
