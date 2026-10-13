import { describe, expect, it } from 'vitest';
import { toLitStaticRenderResult } from '../lit-static-render-result.ts';

const rendered = {
	cacheStrategy: { revalidate: 60 },
	sourceDependencyPaths: ['/app/src/pages/docs.lit.tsx'],
	metadata: { title: 'Docs', description: 'Docs page', robots: { index: false } },
};

describe('toLitStaticRenderResult', () => {
	it('posts the resolved metadata and cache details with the HTML of a string body', async () => {
		await expect(toLitStaticRenderResult({ body: '<html>docs</html>', ...rendered })).resolves.toEqual({
			html: '<html>docs</html>',
			...rendered,
		});
	});

	it('reads a buffer body as UTF-8', async () => {
		const result = await toLitStaticRenderResult({ body: Buffer.from('<html>buffer</html>'), ...rendered });

		expect(result.html).toBe('<html>buffer</html>');
		expect(result.metadata).toEqual(rendered.metadata);
	});

	it('drains a stream body', async () => {
		const result = await toLitStaticRenderResult({
			body: new Response('<html>stream</html>').body as ReadableStream,
			...rendered,
		});

		expect(result.html).toBe('<html>stream</html>');
		expect(result.metadata).toEqual(rendered.metadata);
	});

	it('rejects a body it cannot serialize', async () => {
		await expect(toLitStaticRenderResult({ body: 42 as never })).rejects.toThrow(
			'Unsupported Lit static render body type: number',
		);
	});
});
