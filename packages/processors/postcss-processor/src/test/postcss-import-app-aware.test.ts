import { describe, expect, test } from 'vitest';
import path from 'node:path';
import { resolveAppRootFromPath } from '../postcss-import-app-aware';

describe('resolveAppRootFromPath', () => {
	test('should resolve the postcss-processor package root from a nested css file', () => {
		const cssPath = path.resolve(__dirname, 'css/tailwind-reference.css');
		const appRoot = resolveAppRootFromPath(cssPath);

		expect(appRoot).toBe(path.resolve(__dirname, '../..'));
	});
});
