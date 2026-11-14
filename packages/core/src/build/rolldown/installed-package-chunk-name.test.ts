import { describe, expect, it } from 'vitest';
import { getInstalledPackageChunkName } from './rolldown-adapter-helpers.ts';

describe('getInstalledPackageChunkName', () => {
	it('names the package at the last node_modules segment', () => {
		expect(
			getInstalledPackageChunkName('/app/node_modules/.pnpm/react-dom@19.0.0/node_modules/react-dom/cjs/a.js'),
		).toBe('vendor-react-dom');
		expect(getInstalledPackageChunkName('/app/node_modules/a/node_modules/b/index.js')).toBe('vendor-b');
	});

	it('joins a scoped package name without the scope marker', () => {
		expect(getInstalledPackageChunkName('/app/node_modules/@lit/reactive-element/index.js')).toBe(
			'vendor-lit-reactive-element',
		);
		expect(getInstalledPackageChunkName('C:\\app\\node_modules\\lit\\index.js')).toBe('vendor-lit');
	});

	it('leaves app code to the default chunking', () => {
		expect(getInstalledPackageChunkName('/app/src/pages/index.tsx')).toBeNull();
	});
});
