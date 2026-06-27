import path from 'node:path';
import type { PlaywrightTestProject } from '@playwright/test';
import { getDefaultWorkerCount } from './workers.ts';

type DesktopChromeUse = NonNullable<PlaywrightTestProject['use']>;

export type FixtureServerMode = 'dev' | 'static' | 'production';

export type FixtureProjectSpec = {
	/** Playwright project name (e.g. `react-router-e2e`). */
	name: string;
	port: number;
	mode: FixtureServerMode;
	env?: Record<string, string>;
	testMatch?: string | string[];
	testIgnore?: string[];
	workers?: number;
	timeout?: number;
};

export type FixtureDefinition = {
	/** Stable block id; used in default Playwright project names when `projects` is omitted. */
	block: string;
	/** Absolute path to the fixture app directory. */
	dir: string;
	/** When set, fully replaces the default dev + static project pair. */
	projects?: FixtureProjectSpec[];
	devPort?: number;
	staticPort?: number;
	productionPort?: number;
	postcssDevPort?: number;
	/** Only boot build + preview (no dev server). */
	staticOnly?: boolean;
	/** Only boot a production server (`bun run app.ts`, no build step). */
	productionOnly?: boolean;
	/** Only boot a dev server (no static project). */
	devOnly?: boolean;
	/** Extra env vars for the dev web server (e.g. feature flags). */
	devEnv?: Record<string, string>;
	/** Extra env vars for the static build + preview web server. */
	staticEnv?: Record<string, string>;
	devWorkers?: number;
	staticWorkers?: number;
	/** Extra env vars for the PostCSS dev server. */
	postcssDevEnv?: Record<string, string>;
};

export type ExternalFixtureDefinition = {
	block: string;
	/** Glob or globs for tests (repo-relative). */
	testMatch: string | string[];
	port: number;
	command: string;
	cwd: string;
	projectName?: string;
	workers?: number;
};

export type FixtureModule = {
	definition: FixtureDefinition | ExternalFixtureDefinition;
	projects: PlaywrightTestProject[];
	webServers: FixtureWebServer[];
	/** Flat list of Playwright project names declared by this fixture. */
	batchProjects: string[];
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
	env?: Record<string, string>;
};

function toRepoRelativeDir(dir: string): string {
	return path.relative(process.cwd(), dir).split(path.sep).join('/');
}

function buildEnvPrefix(options: { port: number; env?: Record<string, string>; nodeEnv: string }): string {
	return [
		options.nodeEnv,
		`ECOPAGES_PORT=${options.port}`,
		...Object.entries(options.env ?? {}).map(([key, value]) => `${key}=${value}`),
	].join(' ');
}

function buildDevServerCommand(options: {
	cwd: string;
	port: number;
	env?: Record<string, string>;
}): string {
	const envPrefix = buildEnvPrefix({ port: options.port, env: options.env, nodeEnv: 'NODE_ENV=development' });
	return `${envPrefix} bun run app.ts --dev`;
}

function buildStaticServerCommand(options: {
	cwd: string;
	port: number;
	env?: Record<string, string>;
}): string {
	const envPrefix = buildEnvPrefix({ port: options.port, env: options.env, nodeEnv: 'NODE_ENV=production' });
	return `${envPrefix} bun run app.ts --build && ${envPrefix} bun run app.ts --preview`;
}

function buildProductionServerCommand(options: {
	cwd: string;
	port: number;
	env?: Record<string, string>;
}): string {
	const envPrefix = buildEnvPrefix({ port: options.port, env: options.env, nodeEnv: 'NODE_ENV=production' });
	return `${envPrefix} bun run app.ts`;
}

function buildServerCommand(spec: FixtureProjectSpec, fixtureDir: string): string {
	const env = { ...spec.env, ECOPAGES_E2E_ARTIFACT_SCOPE: spec.name };
	switch (spec.mode) {
		case 'dev':
			return buildDevServerCommand({ cwd: fixtureDir, port: spec.port, env });
		case 'static':
			return buildStaticServerCommand({ cwd: fixtureDir, port: spec.port, env });
		case 'production':
			return buildProductionServerCommand({ cwd: fixtureDir, port: spec.port, env });
	}
}

function defaultTestMatch(fixtureDir: string): string {
	return `${fixtureDir}/**/*.test.e2e.ts`;
}

function resolveProjectSpecs(definition: FixtureDefinition, fixtureDir: string): FixtureProjectSpec[] {
	const defaultTest = defaultTestMatch(fixtureDir);

	if (definition.projects) {
		return definition.projects.map((spec) => ({
			...spec,
			testMatch: spec.testMatch ?? defaultTest,
		}));
	}

	if (definition.staticOnly) {
		if (!definition.staticPort) {
			throw new Error(`Fixture ${definition.block}: staticOnly requires staticPort`);
		}

		return [
			{
				name: `${definition.block}-static-e2e`,
				port: definition.staticPort,
				mode: 'static',
				env: definition.staticEnv,
				testMatch: defaultTest,
				testIgnore: [`${fixtureDir}/**/*.dev.test.e2e.ts`],
				workers: definition.staticWorkers,
			},
		];
	}

	if (definition.productionOnly) {
		if (!definition.productionPort) {
			throw new Error(`Fixture ${definition.block}: productionOnly requires productionPort`);
		}

		return [
			{
				name: `${definition.block}-e2e`,
				port: definition.productionPort,
				mode: 'production',
				testMatch: defaultTest,
				workers: definition.staticWorkers,
			},
		];
	}

	if (definition.devOnly) {
		if (!definition.devPort) {
			throw new Error(`Fixture ${definition.block}: devOnly requires devPort`);
		}

		return [
			{
				name: `${definition.block}-dev-e2e`,
				port: definition.devPort,
				mode: 'dev',
				env: definition.devEnv,
				testMatch: defaultTest,
				testIgnore: [`${fixtureDir}/**/*.static.test.e2e.ts`],
				workers: definition.devWorkers ?? 1,
			},
		];
	}

	if (!definition.devPort || !definition.staticPort) {
		throw new Error(`Fixture ${definition.block}: default layout requires devPort and staticPort`);
	}

	const specs: FixtureProjectSpec[] = [
		{
			name: `${definition.block}-dev-e2e`,
			port: definition.devPort,
			mode: 'dev',
			env: definition.devEnv,
			testMatch: defaultTest,
			testIgnore: [`${fixtureDir}/**/*.static.test.e2e.ts`, `${fixtureDir}/**/*.postcss.dev.test.e2e.ts`],
			workers: definition.devWorkers ?? 1,
		},
		{
			name: `${definition.block}-static-e2e`,
			port: definition.staticPort,
			mode: 'static',
			env: definition.staticEnv,
			testMatch: defaultTest,
			testIgnore: [`${fixtureDir}/**/*.dev.test.e2e.ts`],
			workers: definition.staticWorkers,
		},
	];

	if (definition.postcssDevPort) {
		specs.splice(1, 0, {
			name: `${definition.block}-postcss-dev-e2e`,
			port: definition.postcssDevPort,
			mode: 'dev',
			env: definition.postcssDevEnv,
			testMatch: `${fixtureDir}/**/*.postcss.dev.test.e2e.ts`,
			workers: definition.devWorkers ?? 1,
		});
	}

	return specs;
}

function buildProjectsFromSpecs(
	specs: FixtureProjectSpec[],
	desktopChrome: DesktopChromeUse,
	defaultWorkerCount: number,
): PlaywrightTestProject[] {
	return specs.map((spec) => ({
		name: spec.name,
		testMatch: spec.testMatch,
		testIgnore: spec.testIgnore,
		workers: spec.workers ?? (spec.mode === 'dev' ? 1 : defaultWorkerCount),
		timeout: spec.timeout,
		use: {
			...desktopChrome,
			baseURL: `http://localhost:${spec.port}`,
		},
	}));
}

function buildWebServersFromSpecs(
	specs: FixtureProjectSpec[],
	fixtureDir: string,
	options: { reuseExistingServer: boolean },
): FixtureWebServer[] {
	return specs.map((spec) => ({
		command: buildServerCommand(spec, fixtureDir),
		cwd: fixtureDir,
		projects: [spec.name],
		reuseExistingServer: options.reuseExistingServer,
		stdout: 'pipe',
		stderr: 'pipe',
		...(spec.mode === 'dev'
			? { url: `http://localhost:${spec.port}/` }
			: { port: spec.port }),
	}));
}

export function defineFixture(
	definition: FixtureDefinition,
	desktopChrome: DesktopChromeUse,
	options: { reuseExistingServer: boolean },
): FixtureModule {
	const defaultWorkerCount = getDefaultWorkerCount();
	const fixtureDir = toRepoRelativeDir(definition.dir);
	const specs = resolveProjectSpecs(definition, fixtureDir);

	return {
		definition,
		projects: buildProjectsFromSpecs(specs, desktopChrome, defaultWorkerCount),
		webServers: buildWebServersFromSpecs(specs, fixtureDir, options),
		batchProjects: specs.map((spec) => spec.name),
	};
}

export function defineExternalFixture(
	definition: ExternalFixtureDefinition,
	desktopChrome: DesktopChromeUse,
	options: { reuseExistingServer: boolean },
): FixtureModule {
	const defaultWorkerCount = getDefaultWorkerCount();
	const projectName = definition.projectName ?? `${definition.block}-e2e`;

	return {
		definition,
		projects: [
			{
				name: projectName,
				testMatch: definition.testMatch,
				workers: definition.workers ?? defaultWorkerCount,
				use: {
					...desktopChrome,
					baseURL: `http://localhost:${definition.port}`,
				},
			},
		],
		webServers: [
			{
				command: definition.command,
				cwd: definition.cwd,
				...(definition.command.includes('--dev') || definition.command.includes(' run dev')
					? { url: `http://localhost:${definition.port}/` }
					: { port: definition.port }),
				projects: [projectName],
				reuseExistingServer: options.reuseExistingServer,
				stdout: 'pipe',
				stderr: 'pipe',
			},
		],
		batchProjects: [projectName],
	};
}
