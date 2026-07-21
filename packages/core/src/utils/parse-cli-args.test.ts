import { afterEach, describe, expect, it } from 'vitest';
import { parseCliArgs } from './parse-cli-args.ts';

const originalArgv = [...process.argv];
const originalNodeEnv = process.env.NODE_ENV;
const originalEmbeddedRuntime = process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME;

describe('parseCliArgs', () => {
	afterEach(() => {
		process.argv = [...originalArgv];

		if (originalNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = originalNodeEnv;
		}

		if (originalEmbeddedRuntime === undefined) {
			delete process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME;
		} else {
			process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME = originalEmbeddedRuntime;
		}
	});

	it('treats embedded development runtimes as dev mode', () => {
		process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME = 'true';
		process.env.NODE_ENV = 'development';

		expect(parseCliArgs()).toEqual({
			preview: false,
			build: false,
			start: false,
			dev: true,
			force: false,
			serveOnly: false,
			port: undefined,
			hostname: undefined,
			reactFastRefresh: undefined,
		});
	});

	it('keeps embedded production runtimes in start mode', () => {
		process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME = 'true';
		process.env.NODE_ENV = 'production';

		expect(parseCliArgs()).toEqual({
			preview: false,
			build: false,
			start: true,
			dev: false,
			force: false,
			serveOnly: false,
			port: undefined,
			hostname: undefined,
			reactFastRefresh: undefined,
		});
	});

	it('supports explicit embedded runtime bootstrap without mutating process env', () => {
		delete process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME;
		process.env.NODE_ENV = 'development';

		expect(parseCliArgs({ embeddedRuntime: true })).toEqual({
			preview: false,
			build: false,
			start: false,
			dev: true,
			force: false,
			serveOnly: false,
			port: undefined,
			hostname: undefined,
			reactFastRefresh: undefined,
		});
	});

	it('parses preview serve-only from env', () => {
		delete process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME;
		delete process.env.NODE_ENV;
		process.env.ECOPAGES_PREVIEW_SERVE_ONLY = 'true';
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'preview'];

		expect(parseCliArgs()).toMatchObject({
			preview: true,
			serveOnly: true,
		});
	});

	it('parses --force for production build commands', () => {
		delete process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME;
		delete process.env.NODE_ENV;
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'build', '--force'];

		expect(parseCliArgs()).toMatchObject({
			build: true,
			force: true,
			dev: false,
		});
		expect(process.env.NODE_ENV).toBe('production');
	});

	it('forces production NODE_ENV for build when ambient env is development', () => {
		delete process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME;
		process.env.NODE_ENV = 'development';
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'build'];

		expect(parseCliArgs()).toMatchObject({
			build: true,
			dev: false,
		});
		expect(process.env.NODE_ENV).toBe('production');
	});

	it('keeps development NODE_ENV for dev commands', () => {
		delete process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME;
		process.env.NODE_ENV = 'development';
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'dev'];

		expect(parseCliArgs()).toMatchObject({
			dev: true,
		});
		expect(process.env.NODE_ENV).toBe('development');
	});

	it('forces production NODE_ENV for preview when ambient env is development', () => {
		delete process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME;
		process.env.NODE_ENV = 'development';
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'preview'];

		expect(parseCliArgs()).toMatchObject({
			preview: true,
			dev: false,
		});
		expect(process.env.NODE_ENV).toBe('production');
	});

	it('forces production NODE_ENV for start when ambient env is development', () => {
		delete process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME;
		process.env.NODE_ENV = 'development';
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'start'];

		expect(parseCliArgs()).toMatchObject({
			start: true,
			dev: false,
		});
		expect(process.env.NODE_ENV).toBe('production');
	});
});
