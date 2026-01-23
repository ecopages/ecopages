import path from 'node:path';

export const FIXTURE_APP_PROJECT_DIR = path.resolve(import.meta.dir, 'app');

export const INDEX_TEMPLATE_FILE = path.resolve(import.meta.dir, 'app/src/pages/index.ghtml.ts');

export const FIXTURE_APP_CSS_FILE = path.resolve(import.meta.dir, 'css/test.css');

export const FIXTURE_CSS_FILE_ERROR = path.resolve(import.meta.dir, 'css/error.css');

export const FIXTURE_EXISTING_CSS_FILE_IN_DIST = 'style.css';

export const FIXTURE_EXISTING_SVG_FILE_IN_DIST = 'assets/favicon.svg';

export const FIXTURE_EXISTING_FILE_GZ_IN_DIST = `${FIXTURE_EXISTING_CSS_FILE_IN_DIST}.gz`;

export const FIXTURE_EXISTING_SVG_FILE_IN_DIST_PATH = `${FIXTURE_APP_PROJECT_DIR}/.eco/${FIXTURE_EXISTING_SVG_FILE_IN_DIST}`;

export const APP_TEST_ROUTES = {
	nonExistentFile: 'non-existent-file.css',
	nonExistentPage: 'non-existent-page',
	existingCssFile: FIXTURE_EXISTING_CSS_FILE_IN_DIST,
	existingSvgFile: FIXTURE_EXISTING_SVG_FILE_IN_DIST,
	index: '/',
	withQuery: '?page=1',
	dynamic: 'dynamic/123',
	dynamicWithQuery: 'dynamic/123?page=1',
	dynamicWithQuryAndParams: 'dynamic/123?page=1',
	catchAll: 'catch-all/123/456',
};

export const BASE_URL = import.meta.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000';

export const APP_TEST_ROUTES_URLS: Record<keyof typeof APP_TEST_ROUTES, string> = Object.fromEntries(
	Object.entries(APP_TEST_ROUTES).map(([key, value]) => [key, `${BASE_URL}/${value}`]),
) as Record<keyof typeof APP_TEST_ROUTES, string>;
