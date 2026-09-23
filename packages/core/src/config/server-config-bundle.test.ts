import { describe, expect, it } from 'vitest';
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
});
