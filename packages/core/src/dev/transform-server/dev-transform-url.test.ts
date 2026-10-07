import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	resolveDevTransformModuleUrl,
	resolveDevTransformModuleSourcePath,
	DEV_TRANSFORM_URL_PREFIX,
} from './dev-transform-url.ts';

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

	it('rejects entrypoints outside srcDir and extra roots', () => {
		expect(() => resolveDevTransformModuleUrl(srcDir, '/etc/passwd.tsx')).toThrow(
			'[dev-transform] Entrypoint must be under srcDir or a workspace package',
		);
	});

	it('maps workspace-package files to @fs URLs', () => {
		const packageRoot = path.resolve('/repo/packages/testing');
		const islandPath = path.join(packageRoot, 'src/kitchen-sink/react-shell.react.tsx');
		expect(resolveDevTransformModuleUrl(srcDir, islandPath, [packageRoot])).toBe(
			`${DEV_TRANSFORM_URL_PREFIX}/@fs${islandPath.replace(/\.tsx$/, '.js')}`,
		);
	});

	it('resolves browser URLs back to source entrypoints', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-transform-url-roundtrip-'));
		const pagesDir = path.join(tempRoot, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });
		const pagePath = path.join(pagesDir, 'index.tsx');
		fs.writeFileSync(pagePath, 'export default function Page() { return null; }\n', 'utf8');

		const moduleUrl = resolveDevTransformModuleUrl(path.join(tempRoot, 'src'), pagePath);
		expect(resolveDevTransformModuleSourcePath(path.join(tempRoot, 'src'), moduleUrl)).toBe(pagePath);

		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	it('resolves stylesheet URLs back to css source files', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-transform-url-css-'));
		const componentsDir = path.join(tempRoot, 'src', 'components');
		fs.mkdirSync(componentsDir, { recursive: true });
		const cssPath = path.join(componentsDir, 'widget.css');
		fs.writeFileSync(cssPath, ':host { display: block; }\n', 'utf8');

		const srcDir = path.join(tempRoot, 'src');
		const moduleUrl = `${DEV_TRANSFORM_URL_PREFIX}/components/widget.css`;
		expect(resolveDevTransformModuleSourcePath(srcDir, moduleUrl)).toBe(cssPath);
	});

	it('resolves @fs URLs back to workspace-package source files', () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-transform-url-ws-'));
		const packageRoot = path.join(tempRoot, 'packages', 'testing');
		const islandDir = path.join(packageRoot, 'src', 'kitchen-sink');
		fs.mkdirSync(islandDir, { recursive: true });
		const islandPath = path.join(islandDir, 'react-shell.react.tsx');
		fs.writeFileSync(islandPath, 'export const shell = 1;\n', 'utf8');

		const srcDir = path.join(tempRoot, 'app', 'src');
		const moduleUrl = resolveDevTransformModuleUrl(srcDir, islandPath, [packageRoot]);
		expect(resolveDevTransformModuleSourcePath(srcDir, moduleUrl, [packageRoot])).toBe(islandPath);

		fs.rmSync(tempRoot, { recursive: true, force: true });
	});
});
