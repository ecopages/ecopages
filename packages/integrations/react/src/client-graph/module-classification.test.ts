import { describe, expect, it } from 'vitest';
import { classifyClientGraphModule, isPageOrLayoutEntry } from './module-classification.ts';

describe('classifyClientGraphModule', () => {
	it('classifies package modules with POSIX and Windows separators', () => {
		expect(classifyClientGraphModule('/app/node_modules/react/index.js')).toBe('package');
		expect(classifyClientGraphModule('C:\\app\\node_modules\\react\\index.js')).toBe('package');
	});

	it('classifies vendored modules with either separator', () => {
		expect(classifyClientGraphModule('/app/.eco/runtime.js')).toBe('vendored');
		expect(classifyClientGraphModule('C:\\app\\.eco\\runtime.js')).toBe('vendored');
		expect(classifyClientGraphModule('/app/assets/vendors/react.js')).toBe('vendored');
		expect(classifyClientGraphModule('C:\\app\\assets\\vendors\\react.js')).toBe('vendored');
	});

	it('classifies app modules under project root', () => {
		expect(classifyClientGraphModule('/app/src/pages/index.tsx', '/app')).toBe('app');
	});
});

describe('isPageOrLayoutEntry', () => {
	it('detects pages and layouts with either separator', () => {
		expect(isPageOrLayoutEntry('/app/src/pages/index.tsx')).toBe(true);
		expect(isPageOrLayoutEntry('C:\\app\\src\\pages\\index.tsx')).toBe(true);
		expect(isPageOrLayoutEntry('/app/src/layouts/main.tsx')).toBe(true);
		expect(isPageOrLayoutEntry('C:\\app\\src\\layouts\\main.tsx')).toBe(true);
		expect(isPageOrLayoutEntry('/app/src/components/button.tsx')).toBe(false);
	});
});
