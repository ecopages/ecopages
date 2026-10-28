import { afterEach, describe, expect, it, vi } from 'vitest';
import { isEcopagesStartCli, parseCliArgs } from './parse-cli-args.ts';
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

	it('recognizes CLI start commands without inferring a launch from a server bundle path', () => {
		process.argv = ['node', '/usr/local/bin/ecopages.js'];
		expect(isEcopagesStartCli()).toBe(true);

		process.argv = ['node', '/usr/local/bin/ecopages.js', 'start'];
		expect(isEcopagesStartCli()).toBe(true);

		process.argv = ['node', '/usr/local/bin/ecopages.js', 'build'];
		expect(isEcopagesStartCli()).toBe(false);

		process.argv = ['node', '/app/dist/.server/app.mjs'];
		expect(isEcopagesStartCli()).toBe(false);

		process.argv = ['node', '/app/server.js'];
		expect(isEcopagesStartCli()).toBe(false);

		process.argv = ['node', '/app/app.ts'];
		expect(isEcopagesStartCli()).toBe(false);
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
