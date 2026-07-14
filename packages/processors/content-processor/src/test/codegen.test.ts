import { describe, expect, test } from 'vitest';
import { renderCollectionModule, renderVirtualModuleTypes } from '../codegen.ts';

describe('codegen', () => {
	test('renderCollectionModule emits static imports and accessors', () => {
		const output = renderCollectionModule(
			'docs',
			'/tmp/cache',
			[
				{
					title: 'Intro',
					description: 'Welcome',
					slug: 'intro',
					segments: ['intro'],
				},
			],
			[
				{
					entry: {
						title: 'Intro',
						description: 'Welcome',
						slug: 'intro',
						segments: ['intro'],
					},
					filePath: '/app/src/content/docs/intro.mdx',
				},
			],
		);

		expect(output).toContain("import docs_intro from '../../app/src/content/docs/intro.mdx';");
		expect(output).toContain('export const entries = [');
		expect(output).toContain('const entriesBySlug: Record<string, (typeof entries)[number]> = {');
		expect(output).toContain('export function getComponent(slug: string)');
	});

	test('renderVirtualModuleTypes resolves src entry types through the app alias', () => {
		const output = renderVirtualModuleTypes(
			{
				docs: { entryType: './src/content/docs-schema#DocsFrontmatter' },
			},
			{
				rootDir: '/app',
				typesOutputFile: '/app/node_modules/@types/ecopages-content-processor/virtual-module.d.ts',
			},
		);

		expect(output).toContain("import type { DocsFrontmatter } from '@/content/docs-schema'");
		expect(output).toContain('export type Entry = ContentEntry<DocsFrontmatter>');
	});
	test('renderVirtualModuleTypes declares one module per collection', () => {
		const output = renderVirtualModuleTypes({
			docs: {},
			blog: { entryType: './src/content/blog-schema#BlogFrontmatter' },
		});
		expect(output).toContain('declare module "ecopages:content/docs"');
		expect(output).toContain('declare module "ecopages:content/blog"');
		expect(output).toContain("import type { ContentEntry } from '@ecopages/content-processor/types'");
		expect(output).toContain("import type { BlogFrontmatter } from './src/content/blog-schema'");
		expect(output).toContain('export type Entry = ContentEntry<BlogFrontmatter>');
	});
});
