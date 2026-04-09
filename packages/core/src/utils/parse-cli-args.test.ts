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
			port: undefined,
			hostname: undefined,
			reactFastRefresh: undefined,
		});
	});
});
