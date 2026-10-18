import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
	defineConfig,
	devices,
	type PlaywrightTestOptions,
	type PlaywrightWorkerOptions,
	type Project,
} from '@playwright/test';
import type { AppOptions } from './e2e/app-fixture.ts';
import { configurePlaywrightColorEnv } from './e2e/playwright/playwright-color-env.mjs';
import './e2e/playwright/strip-inherited-pwdebug.mjs';

configurePlaywrightColorEnv(process.env);

const chrome = devices['Desktop Chrome'];
const prKitchenSinkTests = process.env.ECOPAGES_E2E_PR === 'true' ? /@content|@stress|@parity/ : undefined;

const projects: Project<PlaywrightTestOptions, PlaywrightWorkerOptions & { appOptions: AppOptions | undefined }>[] = [
	{
		name: 'browser-router-e2e',
		testMatch: 'e2e/fixtures/browser-router/**/*.test.e2e.ts',
		use: { ...chrome, baseURL: 'http://localhost:4002' },
	},
	{
		name: 'core-hmr-dev-e2e',
		testMatch: 'e2e/fixtures/core-hmr/hmr.dev.test.e2e.ts',
		timeout: 60_000,
		use: { ...chrome, appOptions: { source: 'e2e/fixtures/core-hmr' } },
	},
	{
		name: 'core-hmr-postcss-dev-e2e',
		testMatch: 'e2e/fixtures/core-hmr/hmr.postcss.dev.test.e2e.ts',
		timeout: 60_000,
		use: {
			...chrome,
			appOptions: { source: 'e2e/fixtures/core-hmr', configFile: 'eco.config.postcss.ts' },
		},
	},
	{
		name: 'cross-integration-dev-e2e',
		testMatch: 'playground/kitchen-sink/e2e/**/*.test.e2e.ts',
		testIgnore: [
			'playground/kitchen-sink/e2e/**/*.preview.test.e2e.ts',
			'playground/kitchen-sink/e2e/*-hmr.test.e2e.ts',
		],
		timeout: 90_000,
		grep: prKitchenSinkTests,
		use: { ...chrome, baseURL: 'http://localhost:4007' },
	},
	{
		name: 'cross-integration-bun-parity-e2e',
		testMatch: 'playground/kitchen-sink/e2e/parity.test.e2e.ts',
		timeout: 60_000,
		grep: prKitchenSinkTests,
		use: { ...chrome, baseURL: 'http://localhost:4013' },
	},
	{
		name: 'cross-integration-bun-build-e2e',
		testMatch: 'playground/kitchen-sink/e2e/dependency-discovery.preview.test.e2e.ts',
		timeout: 60_000,
		grep: prKitchenSinkTests,
		use: { ...chrome, baseURL: 'http://localhost:4011' },
	},
	{
		name: 'cross-integration-hmr-node-e2e',
		testMatch: 'playground/kitchen-sink/e2e/*-hmr.test.e2e.ts',
		fullyParallel: true,
		workers: 2,
		timeout: 90_000,
		use: {
			...chrome,
			appOptions: {
				source: 'playground/kitchen-sink',
				env: { ECOPAGES_CROSS_INTEGRATION_E2E: 'true', ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS: '0' },
			},
		},
	},
	{
		name: 'cross-integration-preview-e2e',
		testMatch: 'playground/kitchen-sink/e2e/**/*.preview.test.e2e.ts',
		timeout: 60_000,
		use: { ...chrome, baseURL: 'http://localhost:4008' },
	},
	{
		name: 'html-pages-e2e',
		testMatch: 'e2e/fixtures/html-pages/**/*.test.e2e.ts',
		testIgnore: ['e2e/fixtures/html-pages/**/*.dev.test.e2e.ts'],
		use: { ...chrome, baseURL: 'http://localhost:4620' },
	},
	{
		name: 'html-pages-dev-e2e',
		testMatch: 'e2e/fixtures/html-pages/**/*.dev.test.e2e.ts',
		timeout: 60_000,
		use: { ...chrome, appOptions: { source: 'e2e/fixtures/html-pages' } },
	},
	{
		name: 'react-router-runtime-modules-e2e',
		testMatch: 'e2e/fixtures/react-router/persist-layouts.test.e2e.ts',
		use: { ...chrome, baseURL: 'http://localhost:4004' },
	},
	{
		name: 'react-router-persist-layouts-dev-e2e',
		testMatch: 'e2e/fixtures/react-router/persist-layouts-hmr.test.e2e.ts',
		timeout: 60_000,
		use: {
			...chrome,
			appOptions: { source: 'e2e/fixtures/react-router', env: { ECOPAGES_PERSIST_LAYOUTS: 'true' } },
		},
	},
];

type ProjectWebServer = {
	projects: readonly string[];
	command: string;
	cwd?: string;
	url: string;
	timeout: number;
	reuseExistingServer: boolean;
	env?: Record<string, string>;
};

const projectWebServers: ProjectWebServer[] = [
	{
		projects: ['browser-router-e2e'],
		command: 'node ../../../packages/ecopages/bin/cli.js preview --runtime node --port 4002',
		cwd: 'e2e/fixtures/browser-router',
		url: 'http://localhost:4002',
		timeout: 180_000,
		reuseExistingServer: !process.env.CI,
		env: { NODE_ENV: 'production', ECOPAGES_PORT: '4002', ECOPAGES_E2E_ARTIFACT_SCOPE: 'browser-router-e2e' },
	},
	{
		projects: ['cross-integration-dev-e2e'],
		command: 'node ../../packages/ecopages/bin/cli.js dev --runtime node --port 4007',
		cwd: 'playground/kitchen-sink',
		url: 'http://localhost:4007',
		timeout: 180_000,
		reuseExistingServer: !process.env.CI,
		env: {
			ECOPAGES_PORT: '4007',
			ECOPAGES_E2E_ARTIFACT_SCOPE: 'cross-integration-dev',
			ECOPAGES_CROSS_INTEGRATION_E2E: 'true',
		},
	},
	{
		projects: ['cross-integration-bun-parity-e2e'],
		command: 'node ../../packages/ecopages/bin/cli.js dev --runtime bun --port 4013',
		cwd: 'playground/kitchen-sink',
		url: 'http://localhost:4013',
		timeout: 45_000,
		reuseExistingServer: !process.env.CI,
		env: {
			ECOPAGES_PORT: '4013',
			ECOPAGES_E2E_ARTIFACT_SCOPE: 'cross-integration-bun-parity',
			ECOPAGES_CROSS_INTEGRATION_E2E: 'true',
		},
	},
	{
		projects: ['cross-integration-bun-build-e2e'],
		command: 'pnpm run build:bun && node ../../packages/ecopages/bin/cli.js preview --runtime bun --port 4011',
		cwd: 'playground/kitchen-sink',
		url: 'http://localhost:4011',
		timeout: 300_000,
		reuseExistingServer: !process.env.CI,
		env: {
			NODE_ENV: 'production',
			ECOPAGES_PORT: '4011',
			ECOPAGES_PREVIEW_SERVE_ONLY: 'true',
			ECOPAGES_E2E_ARTIFACT_SCOPE: 'cross-integration-bun-build',
			ECOPAGES_CROSS_INTEGRATION_E2E: 'true',
		},
	},
	{
		projects: ['cross-integration-preview-e2e'],
		command: 'pnpm run build:node && node ../../packages/ecopages/bin/cli.js preview --runtime node --port 4008',
		cwd: 'playground/kitchen-sink',
		url: 'http://localhost:4008',
		timeout: 300_000,
		reuseExistingServer: !process.env.CI,
		env: {
			NODE_ENV: 'production',
			ECOPAGES_PORT: '4008',
			ECOPAGES_PREVIEW_SERVE_ONLY: 'true',
			ECOPAGES_CROSS_INTEGRATION_E2E: 'true',
		},
	},
	{
		projects: ['html-pages-e2e'],
		command:
			'node ../../../packages/ecopages/bin/cli.js build --runtime node && node ../../../packages/ecopages/bin/cli.js preview --runtime node --port 4620',
		cwd: 'e2e/fixtures/html-pages',
		url: 'http://localhost:4620',
		timeout: 180_000,
		reuseExistingServer: !process.env.CI,
		env: {
			NODE_ENV: 'production',
			ECOPAGES_PORT: '4620',
			ECOPAGES_E2E_ARTIFACT_SCOPE: 'html-pages-e2e',
			ECOPAGES_PREVIEW_SERVE_ONLY: 'true',
		},
	},
	{
		projects: ['react-router-runtime-modules-e2e'],
		command: 'node ../../../packages/ecopages/bin/cli.js preview --runtime node --port 4004',
		cwd: 'e2e/fixtures/react-router',
		url: 'http://localhost:4004',
		timeout: 180_000,
		reuseExistingServer: !process.env.CI,
		env: {
			NODE_ENV: 'production',
			ECOPAGES_PORT: '4004',
			ECOPAGES_PERSIST_LAYOUTS: 'true',
			ECOPAGES_E2E_ARTIFACT_SCOPE: 'react-router-runtime-modules-e2e',
		},
	},
];

type ListedTest = { projectName?: string };
type ListedSpec = { tests?: ListedTest[] };
type ListedSuite = { specs?: ListedSpec[]; suites?: ListedSuite[] };
type PlaywrightListReport = { suites: ListedSuite[] };

function testsFromCliArguments(): string[] {
	const testCommandIndex = process.argv.findIndex((argument, index) => index >= 2 && argument === 'test');
	return testCommandIndex === -1 ? process.argv.slice(2) : process.argv.slice(testCommandIndex + 1);
}

function selectedProjectsFromArguments(args: readonly string[]): Set<string> {
	const selected = new Set<string>();

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--project' || argument === '-p') {
			for (index += 1; index < args.length && !args[index].startsWith('-'); index += 1) {
				selected.add(args[index]);
			}
			index -= 1;
		} else if (argument.startsWith('--project=')) {
			selected.add(argument.slice('--project='.length));
		} else if (argument.startsWith('-p=')) {
			selected.add(argument.slice('-p='.length));
		}
	}

	return selected;
}

function matchesProjectSelector(projectName: string, selectors: ReadonlySet<string>): boolean {
	const normalizedProjectName = projectName.toLocaleLowerCase();

	for (const selector of selectors) {
		const normalizedSelector = selector.toLocaleLowerCase();
		if (normalizedSelector.includes('*')) {
			const pattern = new RegExp(`^${normalizedSelector.split('*').map(escapeRegExp).join('.*')}$`, 'i');
			if (pattern.test(projectName)) return true;
		} else if (normalizedSelector === normalizedProjectName) {
			return true;
		}
	}

	return false;
}

function escapeRegExp(value: string): string {
	return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function isListArgument(argument: string): boolean {
	return argument === '--list' || argument.startsWith('--list=');
}

function isReporterArgument(argument: string): boolean {
	return argument === '--reporter' || argument.startsWith('--reporter=');
}

function shardProjectsFromList(suites: readonly ListedSuite[]): Set<string> {
	const projectNames = new Set<string>();
	const visit = (suite: ListedSuite) => {
		for (const spec of suite.specs ?? []) {
			for (const test of spec.tests ?? []) {
				if (test.projectName) projectNames.add(test.projectName);
			}
		}
		for (const child of suite.suites ?? []) visit(child);
	};

	for (const suite of suites) visit(suite);
	return projectNames;
}

function selectedProjectsForShard(args: readonly string[]): Set<string> {
	const listArgs: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (isListArgument(argument)) continue;
		if (isReporterArgument(argument)) {
			if (argument === '--reporter') index += 1;
			continue;
		}
		listArgs.push(argument);
	}
	const playwrightCli = path.resolve('node_modules/playwright/cli.js');
	const report = execFileSync(process.execPath, [playwrightCli, 'test', '--list', '--reporter=json', ...listArgs], {
		cwd: process.cwd(),
		env: { ...process.env, ECOPAGES_RESOLVING_PLAYWRIGHT_SHARD: 'true' },
		encoding: 'utf8',
		maxBuffer: 20 * 1024 * 1024,
	});
	return shardProjectsFromList((JSON.parse(report) as PlaywrightListReport).suites);
}

const cliArgs = testsFromCliArguments();
const explicitlySelectedProjects = selectedProjectsFromArguments(cliArgs);
const hasShard = cliArgs.some((argument) => argument === '--shard' || argument.startsWith('--shard='));
const isListingTests = cliArgs.some(isListArgument);
const resolvingShard = process.env.ECOPAGES_RESOLVING_PLAYWRIGHT_SHARD === 'true';
const shouldFilterWebServers = resolvingShard || isListingTests || hasShard || explicitlySelectedProjects.size > 0;
const selectedProjects =
	resolvingShard || isListingTests
		? new Set<string>()
		: hasShard
			? selectedProjectsForShard(cliArgs)
			: explicitlySelectedProjects;
const webServer = (
	shouldFilterWebServers
		? projectWebServers.filter((definition) =>
				definition.projects.some((name) => matchesProjectSelector(name, selectedProjects)),
			)
		: projectWebServers
).map((definition) => ({
	command: definition.command,
	cwd: definition.cwd,
	url: definition.url,
	timeout: definition.timeout,
	reuseExistingServer: definition.reuseExistingServer,
	env: definition.env,
}));

export default defineConfig<object, { appOptions: AppOptions | undefined }>({
	testDir: '.',
	testMatch: '**/*.test.e2e.ts',
	fullyParallel: true,
	workers: '100%',
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: 'list',
	use: {
		headless: true,
		trace: 'on-first-retry',
	},
	projects,
	webServer,
});
