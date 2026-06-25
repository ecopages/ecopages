import type { PlaywrightTestProject } from '@playwright/test';
import { coreE2ePort, corePostcssE2ePort, reactPlaygroundE2ePort } from './ports.ts';

type DesktopChromeUse = NonNullable<PlaywrightTestProject['use']>;

export function createFixturePlaywrightProjects(desktopChrome: DesktopChromeUse) {
	return [
		{
			name: 'core-e2e',
			testMatch: 'packages/core/**/*.test.e2e.ts',
			testIgnore: ['packages/core/**/*.postcss.test.e2e.ts', 'packages/core/dist/**/*.test.e2e.ts'],
			use: {
				...desktopChrome,
				baseURL: `http://localhost:${coreE2ePort}`,
			},
		},
		{
			name: 'core-postcss-e2e',
			testMatch: 'packages/core/**/*.postcss.test.e2e.ts',
			use: {
				...desktopChrome,
				baseURL: `http://localhost:${corePostcssE2ePort}`,
			},
		},
		{
			name: 'browser-router-e2e',
			testMatch: 'e2e/tests/browser-router/**/*.test.e2e.ts',
			use: {
				...desktopChrome,
				baseURL: 'http://localhost:4002',
			},
		},
		{
			name: 'docs-e2e',
			testMatch: 'e2e/tests/docs/**/*.test.e2e.ts',
			use: {
				...desktopChrome,
				baseURL: 'http://localhost:4009',
			},
		},
		{
			name: 'react-router-e2e',
			testMatch: 'e2e/tests/react-router/**/*.test.e2e.ts',
			testIgnore: [
				'**/persist-layouts.test.e2e.ts',
				'**/*hmr*.test.e2e.ts',
				'**/eco-layout-switch.test.e2e.ts',
			],
			use: {
				...desktopChrome,
				baseURL: 'http://localhost:4003',
			},
		},
		{
			name: 'react-router-persist-layouts-e2e',
			testMatch: 'e2e/tests/react-router/persist-layouts.test.e2e.ts',
			use: {
				...desktopChrome,
				baseURL: 'http://localhost:4004',
			},
		},
		{
			name: 'react-router-persist-layouts-dev-e2e',
			testMatch: [
				'e2e/tests/react-router/persist-layouts-hmr.test.e2e.ts',
				'e2e/tests/react-router/eco-layout-switch.test.e2e.ts',
			],
			use: {
				...desktopChrome,
				baseURL: 'http://localhost:4006',
			},
		},
		{
			name: 'cache-e2e',
			testMatch: 'e2e/tests/cache/**/*.test.e2e.ts',
			use: {
				...desktopChrome,
				baseURL: 'http://localhost:4005',
			},
		},
		{
			name: 'react-playground-e2e',
			testMatch: 'e2e/tests/react-playground/**/*.test.e2e.ts',
			use: {
				...desktopChrome,
				baseURL: `http://localhost:${reactPlaygroundE2ePort}`,
			},
		},
	];
}
