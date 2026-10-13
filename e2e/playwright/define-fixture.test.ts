import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defineFixture } from './define-fixture.ts';

describe('defineFixture', () => {
	const fixture = defineFixture(
		{
			block: 'sample',
			dir: path.join(process.cwd(), 'e2e/fixtures/html-pages'),
			projects: [
				{ name: 'sample-dev-e2e', mode: 'dev', env: { SAMPLE: '1' }, configFile: 'eco.config.alt.ts' },
				{ name: 'sample-static-e2e', mode: 'static', port: 4102 },
			],
		},
		{},
		{ reuseExistingServer: false },
	);
	const project = (name: string) => fixture.projects.find((candidate) => candidate.name === name);

	it('runs a dev project on a per-worker app copy and starts no web server for it', () => {
		expect(project('sample-dev-e2e')?.use?.appOptions).toEqual({
			source: 'e2e/fixtures/html-pages',
			env: { SAMPLE: '1' },
			configFile: 'eco.config.alt.ts',
		});
		expect(project('sample-dev-e2e')?.use?.baseURL).toBeUndefined();
		expect(fixture.webServers.flatMap((server) => server.projects)).toEqual(['sample-static-e2e']);
	});

	it('serves the static export through the ecopages CLI on Node', () => {
		const command = fixture.webServers[0].command;

		expect(project('sample-static-e2e')?.use?.baseURL).toBe('http://localhost:4102');
		expect(command).toContain('NODE_ENV=production ECOPAGES_PORT=4102');
		expect(command).toMatch(/ node ".*packages\/ecopages\/bin\/cli\.js" preview --runtime node$/);
	});

	it('never starts a server through Bun', () => {
		expect(fixture.webServers.map((server) => server.command).join('\n')).not.toMatch(/\bbun\b/);
	});
});
