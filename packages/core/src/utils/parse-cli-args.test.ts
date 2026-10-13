import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from './parse-cli-args.ts';

const originalArgv = [...process.argv];

describe('parseCliArgs', () => {
	afterEach(() => {
		process.argv = [...originalArgv];
	});

	it('parses preview serve-only from env', () => {
		vi.stubEnv('NODE_ENV', undefined);
		vi.stubEnv('ECOPAGES_PREVIEW_SERVE_ONLY', 'true');
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
		expect(process.env.NODE_ENV).toBe('production');
	});

	it('keeps development NODE_ENV for dev commands', () => {
		vi.stubEnv('NODE_ENV', 'development');
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'dev'];

		expect(parseCliArgs()).toMatchObject({
			dev: true,
		});
		expect(process.env.NODE_ENV).toBe('development');
	});

	it('forces production NODE_ENV for preview when ambient env is development', () => {
		vi.stubEnv('NODE_ENV', 'development');
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'preview'];

		expect(parseCliArgs()).toMatchObject({
			preview: true,
			dev: false,
		});
		expect(process.env.NODE_ENV).toBe('production');
	});

	it('forces production NODE_ENV for start when ambient env is development', () => {
		vi.stubEnv('NODE_ENV', 'development');
		process.argv = ['node', '/usr/local/bin/ecopages.js', 'start'];

		expect(parseCliArgs()).toMatchObject({
			start: true,
			dev: false,
		});
		expect(process.env.NODE_ENV).toBe('production');
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
		expect(process.env.NODE_ENV).toBe('production');
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
