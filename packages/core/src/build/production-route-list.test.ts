import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { loadProductionTemplateRoutes, writeProductionRouteList } from './production-route-list.ts';

describe('production route list', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const tempDir of tempDirs.splice(0)) {
			fileSystem.remove(tempDir);
		}
	});

	it('round-trips filesystem routes relative to the app root', () => {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-route-list-'));
		tempDirs.push(rootDir);
		const appConfig = {
			rootDir,
			distDir: 'dist',
			absolutePaths: { distDir: path.join(rootDir, 'dist') },
		} as unknown as EcoPagesAppConfig;
		const filePath = path.join(rootDir, 'src/pages/about.tsx');

		writeProductionRouteList(appConfig, [
			{ pathname: '/about', kind: 'exact', role: 'page', filePath, paramNames: [] },
		]);

		expect(loadProductionTemplateRoutes(appConfig)).toEqual([
			{ pathname: '/about', kind: 'exact', role: 'page', filePath, paramNames: [] },
		]);
	});
});
