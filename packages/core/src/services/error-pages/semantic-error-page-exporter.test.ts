import { describe, expect, it, vi } from 'vitest';
import { ErrorPageRenderer } from './error-page-renderer.ts';
import { SemanticErrorPageExporter } from './semantic-error-page-exporter.ts';

describe('SemanticErrorPageExporter', () => {
	it('writes artifacts with the renderer source file and skips occupied pathnames', async () => {
		const errorPageRenderer = {
			resolveSourceFile: vi.fn(async (kind: 'notFound' | 'serverError') =>
				kind === 'notFound' ? '/app/src/views/not-found.kita.tsx' : undefined,
			),
			render: vi.fn(async ({ kind }: { kind: 'notFound' | 'serverError' }) => ({
				body: kind === 'notFound' ? '<html>404</html>' : '<html>500</html>',
			})),
		} as unknown as ErrorPageRenderer;
		const writeCalls: Array<{
			pathname: string;
			sourceFile?: string;
			activeStaticPathnames: Set<string>;
			createContents: () => Promise<string | Buffer>;
		}> = [];
		const writeArtifact = vi.fn(async (input: (typeof writeCalls)[number]) => {
			writeCalls.push(input);
		});
		const exporter = new SemanticErrorPageExporter({ errorPageRenderer, writeArtifact });
		const activeStaticPathnames = new Set(['/500']);

		await exporter.export(activeStaticPathnames);

		expect(writeCalls).toHaveLength(1);
		expect(writeCalls[0]).toMatchObject({
			pathname: '/404',
			sourceFile: '/app/src/views/not-found.kita.tsx',
			activeStaticPathnames,
		});
		expect(errorPageRenderer.render).not.toHaveBeenCalled();

		const html = await writeCalls[0]?.createContents();
		expect(html).toBe('<html>404</html>');
		expect(errorPageRenderer.render).toHaveBeenCalledWith({ kind: 'notFound' });
	});
});
