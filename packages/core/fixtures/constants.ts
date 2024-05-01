import path from 'node:path';

export const FIXTURE_PROJECT_DIR = path.resolve(import.meta.dir, 'app');

export const CSS_FIXTURE_FILE = path.resolve(import.meta.dir, 'app/src/test/test.css');

export const CSS_FIXTURE_FILE_ERROR = path.resolve(import.meta.dir, 'app/src/test/error.css');

export const FIXTURE_EXISTING_FILE_IN_DIST = 'styles/tailwind.css';

export const FIXTURE_EXISTING_FILE_GZ_IN_DIST = `${FIXTURE_EXISTING_FILE_IN_DIST}.gz`;
