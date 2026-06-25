import { coreE2ePort, corePostcssE2ePort, reactPlaygroundE2ePort } from './ports.ts';

type FixtureWebServer = {
	command: string;
	cwd: string;
	port: number;
	projects: string[];
	reuseExistingServer: boolean;
	stdout: 'pipe';
	stderr: 'pipe';
};

/**
 * `webServer` entries for repo fixtures that run in-place (no `.e2e-tmp` copy).
 * Kitchen-sink hosts are built separately in `kitchen-sink.ts` via `run-isolated-app.mjs`.
 */
export function createFixtureWebServers(reuseExistingServer: boolean): FixtureWebServer[] {
	return [
		{
			command: `NODE_ENV=development ECOPAGES_PORT=${coreE2ePort} bun run app.ts --dev`,
			cwd: 'packages/core/__fixtures__/app',
			port: coreE2ePort,
			projects: ['core-e2e'],
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: `NODE_ENV=development ECOPAGES_USE_POSTCSS_PROCESSOR=true ECOPAGES_PORT=${corePostcssE2ePort} bun run app.ts --dev`,
			cwd: 'packages/core/__fixtures__/app',
			port: corePostcssE2ePort,
			projects: ['core-postcss-e2e'],
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=production ECOPAGES_PORT=4005 bun run app.ts',
			cwd: 'e2e/fixtures/cache-app',
			port: 4005,
			projects: ['cache-e2e'],
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=production ECOPAGES_PORT=4002 bun run app.ts --preview',
			cwd: 'e2e/fixtures/browser-router-app',
			port: 4002,
			projects: ['browser-router-e2e'],
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command:
				'NODE_ENV=production pnpm --filter @ecopages/docs run build && NODE_ENV=production ECOPAGES_PORT=4009 pnpm --filter @ecopages/docs run preview',
			cwd: '.',
			port: 4009,
			projects: ['docs-e2e'],
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=production ECOPAGES_PORT=4003 bun run app.ts --preview',
			cwd: 'e2e/fixtures/react-router-app',
			port: 4003,
			projects: ['react-router-e2e'],
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=production ECOPAGES_PORT=4004 ECOPAGES_PERSIST_LAYOUTS=true bun run app.ts --preview',
			cwd: 'e2e/fixtures/react-router-app',
			port: 4004,
			projects: ['react-router-persist-layouts-e2e'],
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: 'NODE_ENV=development ECOPAGES_PORT=4006 ECOPAGES_PERSIST_LAYOUTS=true bun run app.ts --dev',
			cwd: 'e2e/fixtures/react-router-app',
			port: 4006,
			projects: ['react-router-persist-layouts-dev-e2e'],
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
		{
			command: `ECOPAGES_PORT=${reactPlaygroundE2ePort} pnpm --filter @ecopages/playground-react run dev`,
			cwd: '.',
			port: reactPlaygroundE2ePort,
			projects: ['react-playground-e2e'],
			reuseExistingServer,
			stdout: 'pipe',
			stderr: 'pipe',
		},
	];
}
