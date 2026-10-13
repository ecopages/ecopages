import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defineFixture } from './define-fixture.ts';

describe('defineFixture', () => {
	const fixture = defineFixture(
		{ block: 'sample', dir: path.join(process.cwd(), 'e2e/fixtures/html-pages'), devPort: 4101, staticPort: 4102 },
		{},
		{ reuseExistingServer: false },
	);
	const commandFor = (project: string) =>
		fixture.webServers.find((server) => server.projects.includes(project))?.command ?? '';

	it('starts the dev server through the ecopages CLI on Node', () => {
		const command = commandFor('sample-dev-e2e');

		expect(command).toContain('NODE_ENV=development ECOPAGES_PORT=4101');
		expect(command).toMatch(/ node ".*packages\/ecopages\/bin\/cli\.js" dev --runtime node$/);
	});

	it('serves the static export through the ecopages CLI on Node', () => {
		const command = commandFor('sample-static-e2e');

		expect(command).toContain('NODE_ENV=production ECOPAGES_PORT=4102');
		expect(command).toMatch(/ node ".*packages\/ecopages\/bin\/cli\.js" preview --runtime node$/);
	});

	it('never starts a server through Bun', () => {
		expect(fixture.webServers.map((server) => server.command).join('\n')).not.toMatch(/\bbun\b/);
	});
});
