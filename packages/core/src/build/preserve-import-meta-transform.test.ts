import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPreserveImportMetaTransform } from './preserve-import-meta-transform.ts';

function transformConfigSource(
	code: string,
	id = '/project/eco.config.ts',
	runtimeDir = '/project/dist/.server',
): string {
	const transform = createPreserveImportMetaTransform(runtimeDir);
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
		expect(transformed).toContain('__ecoServerPath.resolve(import.meta.dirname, "../..")');
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
			const __ecoServerPath = 'reserved';
			export default { rootDir: import.meta.dir, sourceUrl: import.meta.url };
		`);

		expect(transformed).toContain("import * as ___ecoServerPath from 'node:path'");
		expect(transformed).toContain('new URL("../../eco.config.ts", import.meta.url).href');
	});

	it('points import.meta.filename and Bun file properties at the source file', () => {
		const transformed = transformConfigSource(
			'export const files = [import.meta.filename, import.meta.path, import.meta.file];',
			'/project/src/pages/page.ts',
		);

		expect(
			transformed.match(/__ecoServerPath\.resolve\(import\.meta\.dirname, "\.\.\/\.\.\/src\/pages\/page\.ts"\)/g),
		).toHaveLength(2);
		expect(transformed).toContain('"page.ts"]');
	});

	it('computes paths from the real path of a symlinked runtime directory', () => {
		const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-import-meta-')));
		try {
			mkdirSync(path.join(root, 'real/dist'), { recursive: true });
			symlinkSync(path.join(root, 'real'), path.join(root, 'link'), 'dir');
			const transformed = transformConfigSource(
				'export const url = import.meta.url;',
				path.join(root, 'real/src/page.ts'),
				path.join(root, 'link/dist'),
			);

			expect(transformed).toContain('new URL("../src/page.ts", import.meta.url).href');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
