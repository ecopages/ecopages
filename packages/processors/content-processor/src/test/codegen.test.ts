import { describe, expect, test } from 'vitest';
import {
	renderCollectionComponentsModule,
	renderCollectionBrowserModule,
	renderCollectionEntriesModule,
	renderVirtualModuleTypes,
} from '../codegen.ts';

describe('codegen', () => {
	test('renderCollectionEntriesModule emits metadata accessors without MDX imports', () => {
		const output = renderCollectionEntriesModule('docs', [
			{
				title: 'Intro',
				description: 'Welcome',
				slug: 'intro',
				segments: ['intro'],
			},
		]);

		expect(output).not.toContain('import docs_intro from');
		expect(output).toContain("import { HttpError } from '@ecopages/core/errors'");
		expect(output).toContain('export const entries = [');
		expect(output).toContain('export function getEntryBySegments(segments: string[])');
		expect(output).toContain('throw HttpError.NotFound(`Unknown content entry: ${slug}`)');
		expect(output).not.toContain('getComponent');
	});

	test('renderCollectionComponentsModule emits lazy MDX loaders, attach helper, and async getComponent', () => {
		const output = renderCollectionComponentsModule('docs', '/tmp/cache', [
			{
				entry: {
					title: 'Intro',
					description: 'Welcome',
					slug: 'intro',
					segments: ['intro'],
				},
				filePath: '/app/src/content/docs/intro.mdx',
			},
		]);

		expect(output).toContain("'intro': () => import('../../app/src/content/docs/intro.mdx'),");
		expect(output).not.toContain('import * as docs_intro_module from');
		expect(output).toContain('function attachMdxExports(module: ContentMdxModule, sourceFile: string)');
		expect(output).toContain('const componentCache = new Map');
		expect(output).toContain('const componentLoadPromises = new Map');
		expect(output).toContain(
			"import { bindComponentIdentity, getComponentIdentity, type EcoComponent, type PageDependenciesResult } from '@ecopages/core';",
		);
		expect(output).toContain("import { HttpError } from '@ecopages/core/errors'");
		expect(output).toContain('throw HttpError.NotFound(`Unknown content entry: ${slug}`)');
		expect(output).toContain("'intro': '/app/src/content/docs/intro.mdx',");
		expect(output).toContain('export async function getComponent(slug: string)');
		expect(output).toContain('export async function getEntryDependencies(slug: string)');
		expect(output).toContain('ownerFile: entrySourceFilesBySlug[slug]');
		expect(output).not.toContain('export const entries');
	});

	test('renderCollectionBrowserModule emits one coalesced dynamic loader per entry', () => {
		const output = renderCollectionBrowserModule('docs', '/tmp/cache', [
			{
				entry: { title: 'Intro', description: 'Welcome', slug: 'intro', segments: ['intro'] },
				filePath: '/app/src/content/docs/intro.mdx',
			},
		]);

		expect(output).toContain("'intro': () => import('../../app/src/content/docs/intro.mdx'),");
		expect(output).toContain('export function loadComponent(slug: string)');
		expect(output).toContain('const componentLoadPromises = new Map');
		expect(output).toContain('attachMdxExports(module, entrySourceFilesBySlug[slug]!)');
		expect(output).not.toContain('getEntryDependencies');
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

	test('renderVirtualModuleTypes declares entries and server modules per collection', () => {
		const output = renderVirtualModuleTypes({
			docs: {},
			blog: { entryType: './src/content/blog-schema#BlogFrontmatter' },
		});
		expect(output).toContain('declare module "ecopages:content/docs"');
		expect(output).toContain('declare module "ecopages:content/docs/server"');
		expect(output).toContain('declare module "ecopages:content/docs/browser"');
		expect(output).toContain(
			'export function loadComponent(slug: string): Promise<EcoComponent<Record<string, unknown>>>',
		);
		expect(output).toContain('/** @throws HttpError 404 when the slug is not in the collection. */');
		expect(output).toContain(
			'export function getEntryDependencies(slug: string): Promise<PageDependenciesResult | undefined>',
		);
		expect(output).toContain('declare module "ecopages:content/blog"');
		expect(output).toContain('declare module "ecopages:content/blog/server"');
		expect(output).toContain("import type { ContentEntry } from '@ecopages/content-processor/types'");
		expect(output).toContain("import type { BlogFrontmatter } from './src/content/blog-schema'");
		expect(output).toContain('export type Entry = ContentEntry<BlogFrontmatter>');
	});
});
