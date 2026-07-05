import { readFile } from 'node:fs/promises';
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { compileDocsMdx } from '@/docs-kit/compile/compile-mdx';
import { resolveFromCatchAll } from '@/docs-kit/compile/resolve-from-catch-all';
import { buildDocsManifest, getContentFilePath } from '@/docs-kit/manifest/build-docs-manifest';
import { DocsLayout } from '@/docs-kit/layout';

type DocsCatchAllProps = {
	title: string;
	source: string;
	section: string;
	slug: string;
};

export default eco.page<DocsCatchAllProps>({
	layout: DocsLayout,
	staticPaths: async () => {
		const manifest = await buildDocsManifest();

		return {
			paths: manifest.sections.flatMap((section) =>
				section.pages.map((page) => ({
					params: {
						slug: [page.section, page.slug],
					},
				})),
			),
		};
	},
	staticProps: async ({ pathname }) => {
		const resolved = resolveFromCatchAll(pathname.params.slug);
		const manifest = await buildDocsManifest();
		const page = manifest.sections
			.flatMap((section) => section.pages)
			.find((entry) => entry.section === resolved.section && entry.slug === resolved.slug);

		if (!page) {
			throw new Error(`Unknown docs page: ${resolved.section}/${resolved.slug}`);
		}

		const filePath = getContentFilePath(resolved.section, resolved.slug);
		const source = await readFile(filePath, 'utf8');

		return {
			props: {
				title: page.title,
				source,
				section: resolved.section,
				slug: resolved.slug,
			},
			metadata: {
				title: page.title,
			},
		};
	},
	render: async ({ title, source, section, slug }) => {
		const filePath = getContentFilePath(section, slug);
		const compiled = await compileDocsMdx({ source, filePath });
		const content = (await compiled.default({})) as JsxRenderable;

		return (
			<>
				<h1>{title}</h1>
				{content}
			</>
		);
	},
});
