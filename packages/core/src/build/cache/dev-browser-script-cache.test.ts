import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import {
	DEV_BROWSER_SCRIPT_CACHE_FILENAME,
	getDevBrowserScriptCacheEntry,
	setDevBrowserScriptCacheEntry,
} from './dev-browser-script-cache.ts';

function createAppConfig(rootDir: string): EcoPagesAppConfig {
	return {
		rootDir,
		distDir: '.eco/public',
		workDir: '.eco',
		absolutePaths: {
			config: join(rootDir, 'eco.config.ts'),
			distDir: join(rootDir, '.eco/public'),
			workDir: join(rootDir, '.eco'),
			srcDir: join(rootDir, 'src'),
		},
	} as EcoPagesAppConfig;
}

describe('dev-browser-script-cache', () => {
	let tempDir: string;
	let appConfig: EcoPagesAppConfig;
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'ecopages-dev-browser-script-cache-'));
		appConfig = createAppConfig(tempDir);
		process.env.NODE_ENV = 'development';
		fileSystem.write(join(tempDir, 'eco.config.ts'), 'export default {};\n');
	});

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
		rmSync(tempDir, { recursive: true, force: true });
	});

	test('persists and restores bundled script outputs across lookups', () => {
		const outputPath = join(tempDir, '.eco/public/assets/page-entry-abc123.js');
		fileSystem.ensureDir(dirname(outputPath));
		fileSystem.write(outputPath, 'console.log("cached");');

		setDevBrowserScriptCacheEntry(appConfig, 'script:content:content:123:build:456', {
			filepath: outputPath,
			kind: 'script',
			inline: false,
		});

		const cached = getDevBrowserScriptCacheEntry(appConfig, 'script:content:content:123:build:456');
		expect(cached?.filepath).toBe(outputPath);

		const manifestPath = join(tempDir, '.eco', '.browser-script-bundles', DEV_BROWSER_SCRIPT_CACHE_FILENAME);
		expect(fileSystem.exists(manifestPath)).toBe(true);
	});

	test('returns null when the cached output file was removed', () => {
		const outputPath = join(tempDir, '.eco/public/assets/missing.js');

		setDevBrowserScriptCacheEntry(appConfig, 'script:content:content:789:build:456', {
			filepath: outputPath,
			kind: 'script',
			inline: false,
		});

		expect(getDevBrowserScriptCacheEntry(appConfig, 'script:content:content:789:build:456')).toBeNull();
	});

	test('does not read dev cache in production', () => {
		process.env.NODE_ENV = 'production';
		const outputPath = join(tempDir, 'dist/assets/page.js');
		fileSystem.write(outputPath, 'console.log("prod");');

		setDevBrowserScriptCacheEntry(appConfig, 'script:content:content:123:build:456', {
			filepath: outputPath,
			kind: 'script',
			inline: false,
		});

		expect(getDevBrowserScriptCacheEntry(appConfig, 'script:content:content:123:build:456')).toBeNull();
	});
});
