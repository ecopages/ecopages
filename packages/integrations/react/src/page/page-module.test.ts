import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getComponentIdentity } from '@ecopages/core';
import { PageModuleService } from './page-module.ts';

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('PageModuleService', () => {
	it('detects configured MDX extensions', () => {
		const service = new PageModuleService({
			mdxExtensions: ['.mdx'],
			integrationName: 'react',
			hasRouterAdapter: false,
		});

		expect(service.isMdxFile('/tmp/app/src/pages/guide.mdx')).toBe(true);
		expect(service.isMdxFile('/tmp/app/src/pages/guide.tsx')).toBe(false);
	});

	describe('ensureConfigFileMetadata', () => {
		const createWorkspace = () => {
			const root = mkdtempSync(path.join(os.tmpdir(), 'react-page-module-'));
			tempDirs.push(root);
			const layoutsDir = path.join(root, 'layouts');
			const componentsDir = path.join(root, 'components');
			const pagesDir = path.join(root, 'pages');
			for (const dir of [layoutsDir, componentsDir, pagesDir]) {
				mkdirSync(dir);
			}
			const service = new PageModuleService({
				layoutsDir,
				componentsDir,
				mdxExtensions: ['.mdx'],
				integrationName: 'react',
				hasRouterAdapter: false,
			});
			return { service, layoutsDir, componentsDir, pagesDir };
		};

		it.each([
			{ owner: 'layouts', dir: 'layoutsDir' as const },
			{ owner: 'components', dir: 'componentsDir' as const },
		])('binds the page to the $owner directory that holds its relative script', ({ dir }) => {
			const workspace = createWorkspace();
			writeFileSync(path.join(workspace[dir], 'shell.script.ts'), '');
			const pagePath = path.join(workspace.pagesDir, 'guide.mdx');

			const config = workspace.service.ensureConfigFileMetadata(
				{ dependencies: { scripts: ['./shell.script.ts'] } },
				pagePath,
			);

			expect(getComponentIdentity(config)).toMatchObject({
				file: path.join(workspace[dir], 'guide.mdx'),
				integration: 'react',
			});
		});

		it('falls back to the page path when no candidate directory holds the dependency', () => {
			const workspace = createWorkspace();
			const pagePath = path.join(workspace.pagesDir, 'guide.mdx');

			const config = workspace.service.ensureConfigFileMetadata(
				{ dependencies: { scripts: ['./missing.script.ts'] } },
				pagePath,
			);

			expect(getComponentIdentity(config)?.file).toBe(pagePath);
		});

		it('keeps an identity that already carries a file', () => {
			const workspace = createWorkspace();
			const identity = { id: 'kept', file: '/app/layouts/kept.mdx', integration: 'mdx' };

			const config = workspace.service.ensureConfigFileMetadata({ identity }, '/app/pages/guide.mdx');

			expect(getComponentIdentity(config)).toEqual(identity);
		});
	});
});
