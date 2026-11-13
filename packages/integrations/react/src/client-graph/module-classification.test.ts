import { describe, expect, it } from 'vitest';
import { classifyClientGraphModule } from './module-classification.ts';

describe('classifyClientGraphModule', () => {
	it('classifies package modules on POSIX and Windows drive paths', () => {
		expect(classifyClientGraphModule('/app/node_modules/react/index.js')).toBe('package');
		expect(classifyClientGraphModule('C:/app/node_modules/react/index.js')).toBe('package');
	});

	it('classifies vendored modules on POSIX and Windows drive paths', () => {
		expect(classifyClientGraphModule('/app/.eco/runtime.js')).toBe('vendored');
		expect(classifyClientGraphModule('C:/app/.eco/runtime.js')).toBe('vendored');
		expect(classifyClientGraphModule('/app/assets/vendors/react.js')).toBe('vendored');
		expect(classifyClientGraphModule('C:/app/assets/vendors/react.js')).toBe('vendored');
	});

	it('classifies app modules under project root', () => {
		expect(classifyClientGraphModule('/app/src/pages/index.tsx', '/app')).toBe('app');
	});
});
