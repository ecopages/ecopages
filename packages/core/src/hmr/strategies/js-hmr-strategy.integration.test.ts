import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installBuildRuntime } from '../../build/build-runtime.ts';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { HmrManager as BunHmrManager } from '../../adapters/bun/hmr-manager.ts';
import type { ClientBridgeEvent } from '../../types/public-types.ts';
import { resolveInternalWorkDir } from '../../utils/resolve-work-dir.ts';

const tempRoots: string[] = [];

function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	tempRoots.push(root);
	return root;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('JsHmrStrategy integration', () => {
	it('rebuilds a registered integration-suffixed script entrypoint on source change', async () => {
		const rootDir = createTempRoot('js-hmr-integration');
		const componentsDir = path.join(rootDir, 'src', 'components', 'script-hmr');
		fs.mkdirSync(componentsDir, { recursive: true });

		const entrypointPath = path.join(componentsDir, 'widget.script.eco.tsx');
		const writeMarker = (marker: string) => {
			fs.writeFileSync(
				entrypointPath,
				`export const marker = ${JSON.stringify(marker)};\nconsole.log(${JSON.stringify(marker)});\n`,
				'utf8',
			);
		};

		writeMarker('BASELINE');

		const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
		config.templatesExt = ['.eco.tsx'];

		const broadcasts: ClientBridgeEvent[] = [];
		using manager = new BunHmrManager({
			appConfig: config,
			bridge: {
				subscriberCount: 0,
				broadcast: (event: ClientBridgeEvent) => {
					broadcasts.push(event);
				},
			} as never,
		});

		manager.setEnabled(true);
		installBuildRuntime(config);

		await manager.registerScriptEntrypoint(entrypointPath);

		expect(manager.getWatchedFiles().has(path.resolve(entrypointPath))).toBe(true);

		const outputPath = path.join(
			resolveInternalWorkDir(config),
			'assets',
			'_hmr',
			'components',
			'script-hmr',
			'widget.script.eco.js',
		);

		expect(fs.existsSync(outputPath)).toBe(true);
		expect(fs.readFileSync(outputPath, 'utf8')).toContain('BASELINE');

		writeMarker('UPDATED');
		broadcasts.length = 0;
		await manager.handleFileChange(entrypointPath);

		expect(broadcasts.length).toBeGreaterThan(0);
		expect(fs.readFileSync(outputPath, 'utf8')).toContain('UPDATED');
		expect(broadcasts.some((event) => event.type === 'reload' || event.type === 'update')).toBe(true);
	});
});
