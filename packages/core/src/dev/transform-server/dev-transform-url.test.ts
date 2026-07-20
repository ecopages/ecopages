import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDevTransformModuleUrl, DEV_TRANSFORM_URL_PREFIX } from './dev-transform-url.ts';

describe('dev transform urls', () => {
	const srcDir = path.resolve('/app/src');

	it('maps page source paths to stable browser URLs', () => {
		const pagePath = path.join(srcDir, 'pages', 'login.tsx');
		expect(resolveDevTransformModuleUrl(srcDir, pagePath)).toBe(`${DEV_TRANSFORM_URL_PREFIX}/pages/login.js`);
	});

	it('encodes dynamic route segments', () => {
		const pagePath = path.join(srcDir, 'pages', 'users', '[id]', 'index.tsx');
		expect(resolveDevTransformModuleUrl(srcDir, pagePath)).toContain('_id_');
	});

	it('rejects entrypoints outside srcDir', () => {
		expect(() => resolveDevTransformModuleUrl(srcDir, '/etc/passwd.tsx')).toThrow(
			'[dev-transform] Entrypoint must be under srcDir',
		);
	});
});
