import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReactPageModuleService } from './react-page-module.service.ts';

const { buildMock } = vi.hoisted(() => ({
	buildMock: vi.fn(),
}));

vi.mock('@ecopages/core/build/build-adapter', async () => {
	const actual = await vi.importActual<typeof import('@ecopages/core/build/build-adapter')>(
		'@ecopages/core/build/build-adapter',
	);

	return {
		...actual,
		build: buildMock,
	};
});

afterEach(() => {
	buildMock.mockReset();
	vi.restoreAllMocks();
});

describe('ReactPageModuleService', () => {
	it('loads compiled MDX modules from self-describing ESM output names', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-page-module-service-'));
		const rootDir = path.join(tempDir, 'app');
		const workDir = path.join(rootDir, '.eco');
		const mdxPath = path.join(rootDir, 'src', 'pages', 'docs', 'guide.mdx');

		fs.mkdirSync(path.dirname(mdxPath), { recursive: true });
		fs.writeFileSync(mdxPath, '# Hello MDX\n', 'utf8');

		buildMock.mockImplementation(async (options) => {
			const naming = String(options.naming);
			const compiledOutputPath = path.join(String(options.outdir), naming.replace('[ext]', 'mjs'));

			fs.mkdirSync(path.dirname(compiledOutputPath), { recursive: true });
			fs.writeFileSync(compiledOutputPath, 'export default { config: { title: "Guide" } };', 'utf8');

			return {
				success: true,
				logs: [],
				outputs: [{ path: compiledOutputPath }],
			};
		});

		const service = new ReactPageModuleService({
			rootDir,
			distDir: path.join(rootDir, 'dist'),
			workDir,
			buildExecutor: {
				build: async () => ({ success: true, logs: [], outputs: [] }),
			},
			mdxExtensions: ['.mdx'],
			integrationName: 'react',
			hasRouterAdapter: false,
		});

		const pageModule = await service.importMdxPageFile(mdxPath);

		expect(buildMock).toHaveBeenCalledTimes(1);
		expect(buildMock).toHaveBeenCalledWith(
			expect.objectContaining({
				entrypoints: [mdxPath],
				format: 'esm',
				naming: expect.stringContaining('[ext]'),
				outdir: path.join(workDir, '.server-modules-react-mdx'),
			}),
			expect.any(Object),
		);
		expect(pageModule.default.config).toEqual({ title: 'Guide' });

		fs.rmSync(tempDir, { recursive: true, force: true });
	});
});
