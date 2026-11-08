import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTRY_COMMAND_FLAGS } from './entry-command-flags.ts';
import { isProductionExport, parseCliArgs, resolveEntryCommand } from './parse-cli-args.ts';
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

describe('resolveEntryCommand', () => {
	const BIN = '/repo/node_modules/ecopages/bin/cli.js';

	it.each([
		[['node', '/app/app.ts', '--build'], { build: true, preview: false, serveOnly: false }, true],
		[['node', '/app/app.ts', '--build', '--port', '3000'], { build: true, port: 3000 }, true],
		[['node', '/app/app.ts', '--preview'], { preview: true, serveOnly: false }, true],
		[['node', '/app/app.ts', '--preview', '--serve-only'], { preview: true, serveOnly: true }, false],
		[['node', '/usr/local/bin/ecopages.js', 'build'], { build: true, start: false }, true],
		[['node', BIN, 'build'], { build: true, start: false }, true],
		[['node', BIN, 'preview', '--serve-only'], { preview: true, serveOnly: true }, false],
		[['node', BIN], { start: true, build: false }, false],
		[['node', '/app/app.ts', '--', '--build'], { build: false, start: true }, false],
		[['node', '/app/app.ts', '--dev'], { dev: true }, false],
		[['node', '/app/app.ts'], { start: true }, false],
		[['node', '/some/tool/cli.js', 'build'], { build: false, start: true }, false],
		[['node', '/repo/node_modules/vitest/vitest.mjs', 'run', '--project', 'shared-core'], { start: true }, false],
	] as const)('reads %j', (argv, expected, productionExport) => {
		const command = resolveEntryCommand([...argv]);

		expect(command).toMatchObject(expected);
		expect(isProductionExport(command)).toBe(productionExport);
	});

	it('reads serve-only from the environment', () => {
		const command = resolveEntryCommand(['node', '/app/app.ts', '--preview'], {
			environment: { ECOPAGES_PREVIEW_SERVE_ONLY: 'true' },
		});

		expect(command.serveOnly).toBe(true);
		expect(isProductionExport(command)).toBe(false);
	});

	it('throws on an unknown option only in strict mode', () => {
		expect(() => resolveEntryCommand(['node', '/app/app.ts', '--nope'])).not.toThrow();
		expect(() => resolveEntryCommand(['node', '/app/app.ts', '--nope'], { strict: true })).toThrow();
	});
});
