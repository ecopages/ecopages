import { describe, expect, it, vi } from 'vitest';
import { ErrorPageRenderer } from './error-page-renderer.ts';
import { SemanticErrorPageExporter } from './semantic-error-page-exporter.ts';

describe('SemanticErrorPageExporter', () => {
	it('writes artifacts and skips occupied pathnames', async () => {
		const errorPageRenderer = {
			render: vi.fn(async ({ kind }: { kind: string }) => ({
				body: kind === 'notFound' ? '<html>404</html>' : `<html>${kind}</html>`,
			})),
		} as unknown as ErrorPageRenderer;
		const writeCalls: Array<{
			pathname: string;
			activeStaticPathnames: Set<string>;
			createContents: () => Promise<string | Buffer>;
		}> = [];
		const writeArtifact = vi.fn(async (input: (typeof writeCalls)[number]) => {
			writeCalls.push(input);
		});
		const exporter = new SemanticErrorPageExporter({ errorPageRenderer, writeArtifact });
		const activeStaticPathnames = new Set(['/500']);

		await exporter.export(activeStaticPathnames);

		expect(writeCalls.map((call) => call.pathname).sort()).toEqual(['/400', '/401', '/403', '/404', '/409']);
		expect(writeCalls.find((call) => call.pathname === '/404')).toMatchObject({
			pathname: '/404',
			activeStaticPathnames,
		});
		expect(errorPageRenderer.render).not.toHaveBeenCalled();

		const html = await writeCalls.find((call) => call.pathname === '/404')?.createContents();
		expect(html).toBe('<html>404</html>');
		expect(errorPageRenderer.render).toHaveBeenCalledWith({ kind: 'notFound' });
	});
});
