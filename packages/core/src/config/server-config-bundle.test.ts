import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rolldown } from 'rolldown';
import { describe, expect, it } from 'vitest';
import { createRolldownPluginBridge } from '../build/rolldown/rolldown-plugin-bridge.ts';
import { createEcoBuildPluginFromSourceTransform } from '../plugins/source-transform.ts';
import { createPreserveImportMetaTransform } from './server-config-bundle.ts';

function transformConfigSource(code: string, id = '/project/eco.config.ts'): string {
	const transform = createPreserveImportMetaTransform('/project/dist/.server');
	const result = transform.transform(code, id);
	if (!result || typeof result === 'string') return result ?? code;
	return result.code;
}

describe('createPreserveImportMetaTransform', () => {
	it('rewrites syntax nodes without changing strings, comments, or legacy bindings', () => {
		const transformed = transformConfigSource(`
			const label = 'import.meta.dirname';
			const __dirname = 'custom';
			// import.meta.url remains documentation here
			export default { rootDir: import.meta.dirname, label, __dirname };
		`);

		expect(transformed).toContain("const label = 'import.meta.dirname'");
		expect(transformed).toContain("const __dirname = 'custom'");
		expect(transformed).toContain('// import.meta.url remains documentation here');
		expect(transformed).toContain('__ecoConfigPath.resolve(import.meta.dirname, "../..")');
	});

	it('serializes quoted paths safely', () => {
		const transformed = transformConfigSource(
			'export default { rootDir: import.meta.dirname };',
			"/project/o'hare/eco.config.ts",
		);

		expect(transformed).toContain('"../../o\'hare"');
	});

	it('preserves source import.meta.url and avoids identifier collisions', () => {
		const transformed = transformConfigSource(`
			const __ecoConfigPath = 'reserved';
			export default { rootDir: import.meta.dir, sourceUrl: import.meta.url };
		`);

		expect(transformed).toContain("import * as ___ecoConfigPath from 'node:path'");
		expect(transformed).toContain('new URL("../../eco.config.ts", import.meta.url).href');
	});

	it('rewrites import.meta that an app source transform emits, because it runs after app transforms', async () => {
		const root = mkdtempSync(path.join(os.tmpdir(), 'eco-config-import-meta-'));
		try {
			const configPath = path.join(root, 'eco.config.ts');
			writeFileSync(configPath, 'export default {};\n');
			const emitsImportMeta = createEcoBuildPluginFromSourceTransform({
				name: 'emits-import-meta',
				filter: /eco\.config\.ts$/,
				transform: (code) => `${code}export const dir = import.meta.dirname;\n`,
			});
			const preserve = createEcoBuildPluginFromSourceTransform(
				createPreserveImportMetaTransform(path.join(root, 'dist', '.server')),
			);

			const bundle = await rolldown({
				input: configPath,
				cwd: root,
				platform: 'node',
				plugins: await createRolldownPluginBridge([preserve, emitsImportMeta], root),
			});
			const { output } = await bundle.generate({ format: 'esm' });
			await bundle.close();

			expect(output[0].code).toContain('const dir = __ecoConfigPath.resolve(import.meta.dirname, ');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
