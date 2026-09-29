import { expect, test } from 'vitest';
import cliJson from '../../../../packages/ecopages/package.json';
import { frameworkVersion } from './framework-version';

test('frameworkVersion matches the published CLI package', () => {
	expect(frameworkVersion).toBe(cliJson.version);
});
