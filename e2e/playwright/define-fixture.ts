import path from 'node:path';
import type { PlaywrightTestProject } from '@playwright/test';
import type { AppOptions } from '../app-fixture.ts';
import { getEcopagesServerReadySignal } from './isolated-dev-server-ready.ts';

type DesktopChromeUse = NonNullable<PlaywrightTestProject['use']>;

/** A Playwright project that may set `use.appOptions` for the `app` fixture of `e2e/app-fixture.ts`. */
export type AppProject = PlaywrightTestProject<object, { appOptions: AppOptions | undefined }>;

/**
 * A project served by `ecopages preview`, which builds the static export and serves it on `port`.
 */
export type StaticProjectSpec = {
	/** Playwright project name (e.g. `react-router-e2e`). */
	name: string;
	mode: 'static';
	port: number;
	env?: Record<string, string>;
	testMatch?: string | string[];
	testIgnore?: string[];
	timeout?: number;
};

/**
 * A project whose workers each run `ecopages dev` on their own copy of the fixture (see `e2e/app-fixture.ts`).
 */
export type DevProjectSpec = {
	name: string;
	mode: 'dev';
	env?: Record<string, string>;
	/** Config file of the copy, relative to the fixture folder. */
	configFile?: string;
	testMatch?: string | string[];
	testIgnore?: string[];
	timeout?: number;
};

export type FixtureProjectSpec = StaticProjectSpec | DevProjectSpec;

export type FixtureDefinition = {
	/** Stable block id. */
	block: string;
	/** Absolute path to the fixture app directory. */
	dir: string;
	projects: FixtureProjectSpec[];
};

export type ExternalFixtureDefinition = {
	block: string;
	/** Glob or globs for tests (repo-relative). */
	testMatch: string | string[];
	port: number;
	command: string;
	cwd: string;
	projectName?: string;
	/**
	 * How Playwright waits for the web server.
	 *
	 * @remarks
	 * `stdout` matches the runtime startup log (`Node server running at`, or `Bun server running at`).
	 * `port` waits for the TCP port to accept connections (preview-only servers).
	 */
	readiness?: 'stdout' | 'port';
};

export type FixtureModule = {
	/** Stable block id, used to order fixtures. */
	block: string;
	projects: AppProject[];
	webServers: FixtureWebServer[];
};

export type FixtureWebServer = {
	command: string;
	cwd: string;
	port?: number;
	projects: string[];
	reuseExistingServer: boolean;
	stdout: 'pipe';
	stderr: 'pipe';
	url?: string;
	wait?: { stdout?: RegExp; stderr?: RegExp };
	env?: Record<string, string>;
};

function toRepoRelativeDir(dir: string): string {
	return path.relative(process.cwd(), dir).split(path.sep).join('/');
}

const ecopagesCli = `node ${JSON.stringify(path.join(process.cwd(), 'packages/ecopages/bin/cli.js'))}`;

/**
 * Starts a static fixture through the `ecopages` CLI on Node, from the fixture directory.
 *
 * @remarks
 * `preview` builds the static export, then serves it.
 */
function buildStaticServerCommand(spec: StaticProjectSpec): string {
	const env = { ...spec.env, ECOPAGES_E2E_ARTIFACT_SCOPE: spec.name };
	const envPrefix = [
		'NODE_ENV=production',
		`ECOPAGES_PORT=${spec.port}`,
		...Object.entries(env).map(([key, value]) => `${key}=${value}`),
	].join(' ');

	return `${envPrefix} ${ecopagesCli} preview --runtime node`;
}

/**
 * @remarks
 * Allow cold Page rendering during initial navigation when development fixtures run under load.
 */
const DEV_FIXTURE_TEST_TIMEOUT_MS = 60_000;

function buildProject(spec: FixtureProjectSpec, fixtureDir: string, desktopChrome: DesktopChromeUse): AppProject {
	const defaultTestMatch = `${fixtureDir}/**/*.test.e2e.ts`;
	const common = {
		name: spec.name,
		testMatch: spec.testMatch ?? defaultTestMatch,
		testIgnore: spec.testIgnore,
	};

	if (spec.mode === 'static') {
		return {
			...common,
			timeout: spec.timeout,
			use: { ...desktopChrome, baseURL: `http://localhost:${spec.port}` },
		};
	}

	return {
		...common,
		timeout: spec.timeout ?? DEV_FIXTURE_TEST_TIMEOUT_MS,
		use: {
			...desktopChrome,
			appOptions: { source: fixtureDir, env: spec.env, configFile: spec.configFile },
		},
	};
}

export function defineFixture(
	definition: FixtureDefinition,
	desktopChrome: DesktopChromeUse,
	options: { reuseExistingServer: boolean },
): FixtureModule {
	const fixtureDir = toRepoRelativeDir(definition.dir);

	return {
		block: definition.block,
		projects: definition.projects.map((spec) => buildProject(spec, fixtureDir, desktopChrome)),
		webServers: definition.projects
			.filter((spec): spec is StaticProjectSpec => spec.mode === 'static')
			.map((spec) => ({
				command: buildStaticServerCommand(spec),
				cwd: fixtureDir,
				projects: [spec.name],
				reuseExistingServer: options.reuseExistingServer,
				stdout: 'pipe',
				stderr: 'pipe',
				...getEcopagesServerReadySignal(),
			})),
	};
}

export function defineExternalFixture(
	definition: ExternalFixtureDefinition,
	desktopChrome: DesktopChromeUse,
	options: { reuseExistingServer: boolean },
): FixtureModule {
	const projectName = definition.projectName ?? `${definition.block}-e2e`;

	return {
		block: definition.block,
		projects: [
			{
				name: projectName,
				testMatch: definition.testMatch,
				use: { ...desktopChrome, baseURL: `http://localhost:${definition.port}` },
			},
		],
		webServers: [
			{
				command: definition.command,
				cwd: definition.cwd,
				...(definition.readiness === 'port' ? { port: definition.port } : getEcopagesServerReadySignal()),
				projects: [projectName],
				reuseExistingServer: options.reuseExistingServer,
				stdout: 'pipe',
				stderr: 'pipe',
			},
		],
	};
}
