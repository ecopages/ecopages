import { describe, expect, test } from 'vitest';
import type { EcoComponent } from '@ecopages/core';
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
		expect(output).toContain("import type { EcoComponent, PageDependenciesResult } from '@ecopages/core';");
		expect(output).toContain('component.config = module.config');
		expect(output).not.toContain('bindComponentIdentity');
		expect(output).not.toContain('attachDiscoveredDependencies');
		expect(output).not.toContain('getComponentIdentity');
		expect(output).toContain("import { HttpError } from '@ecopages/core/errors'");
		expect(output).toContain('throw HttpError.NotFound(`Unknown content entry: ${slug}`)');
		expect(output).toContain("'intro': '/app/src/content/docs/intro.mdx',");
		expect(output).toContain('export async function getComponent(slug: string)');
		expect(output).toContain('export async function getEntryDependencies(slug: string)');
		expect(output).toContain('components: [component]');
		expect(output).not.toContain('...dependencies');
		expect(output).not.toContain('ownerFile: entrySourceFilesBySlug[slug]');
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
		expect(output).toContain("import type { EcoComponent } from '@ecopages/core'");
		expect(output).not.toContain('bindComponentIdentity');
		expect(output).not.toContain('getEntryDependencies');
		expect(output).not.toContain('getComponentRenderContext');
		expect(output).not.toContain('assertContentEntryOwnerLane');
		expect(output).not.toContain('$$typeof');
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
		expect(output).toContain('export function getEntryDependencies(slug: string): Promise<PageDependenciesResult>');
		expect(output).toContain('declare module "ecopages:content/blog"');
		expect(output).toContain('declare module "ecopages:content/blog/server"');
		expect(output).toContain("import type { ContentEntry } from '@ecopages/content-processor/types'");
		expect(output).toContain("import type { BlogFrontmatter } from './src/content/blog-schema'");
		expect(output).toContain('export type Entry = ContentEntry<BlogFrontmatter>');
	});

	test('fallback content-virtual-modules.d.ts separates server and browser wildcards and omits them from catch-all', async () => {
		const { readFileSync } = await import('node:fs');
		const { resolve } = await import('node:path');
		const dtsContent = readFileSync(resolve(import.meta.dirname, '../content-virtual-modules.d.ts'), 'utf-8');

		const serverIndex = dtsContent.indexOf("declare module 'ecopages:content/*/server'");
		const browserIndex = dtsContent.indexOf("declare module 'ecopages:content/*/browser'");
		const catchAllIndex = dtsContent.indexOf("declare module 'ecopages:content/*'");

		expect(serverIndex).toBeGreaterThan(-1);
		expect(browserIndex).toBeGreaterThan(-1);
		expect(catchAllIndex).toBeGreaterThan(-1);

		// Variant patterns must precede the catch-all wildcard for TypeScript pattern precedence
		expect(serverIndex).toBeLessThan(catchAllIndex);
		expect(browserIndex).toBeLessThan(catchAllIndex);

		const catchAllBlock = dtsContent.slice(catchAllIndex);
		expect(catchAllBlock).toContain('export const entries: readonly Entry[];');
		expect(catchAllBlock).toContain('export function getEntry(slug: string): Entry;');
		expect(catchAllBlock).not.toContain('getComponent');
		expect(catchAllBlock).not.toContain('loadComponent');
		expect(catchAllBlock).not.toContain('getEntryDependencies');
	});

	test('attachMdxExports assigns loader-attributed config by reference and does not re-bind', () => {
		const output = renderCollectionComponentsModule('docs', '/tmp/cache', [
			{
				entry: { title: 'Intro', description: 'Welcome', slug: 'intro', segments: ['intro'] },
				filePath: '/app/src/content/docs/intro.mdx',
			},
		]);

		expect(output).toContain('if (!module.config.identity)');
		expect(output).toContain('component.config = module.config');
		expect(output).not.toContain('bindComponentIdentity(');
		expect(output).not.toContain('attachDiscoveredDependencies(');
		expect(output).not.toContain('{ ...component.config');
	});

	test('server module guards owned MDX entries against foreign render lanes before invocation', () => {
		const output = renderCollectionComponentsModule('docs', '/tmp/cache', [
			{
				entry: { title: 'Intro', description: 'Welcome', slug: 'intro', segments: ['intro'] },
				filePath: '/app/src/content/docs/intro.mdx',
			},
		]);

		expect(output).toContain("import { assertContentEntryOwnerLane } from '@ecopages/content-processor/ownership'");
		expect(output).toContain('assertContentEntryOwnerLane(sourceFile, module.config?.identity?.integration)');
		expect(output).not.toContain('$$typeof');
		expect(output).not.toContain('getComponentRenderContext');
	});
});

describe('attachMdxExports ownership guard', () => {
	test('throws for mismatched lanes, skips async invocation in a foreign lane, and passes in the owning lane', async () => {
		const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
		const { join } = await import('node:path');
		const { runWithComponentRenderContext } =
			await import('@ecopages/core/route-renderer/orchestration/foreign-child/component-render-context');

		const tempDir = mkdtempSync(join(import.meta.dirname, '.codegen-'));
		const cacheDir = join(tempDir, 'cache');
		mkdirSync(cacheDir, { recursive: true });
		mkdirSync(join(tempDir, 'src'), { recursive: true });

		const reactEntryPath = join(tempDir, 'src', 'intro.react.mjs');
		const hostEntryPath = join(tempDir, 'src', 'intro.host.mjs');
		const asyncEntryPath = join(tempDir, 'src', 'intro.async.mjs');
		writeFileSync(
			reactEntryPath,
			[
				'export default () => "react-entry";',
				"export const config = { identity: { id: 'intro-react', file: '/app/src/content/docs/intro.react.mdx', integration: 'react' } };",
				'',
			].join('\n'),
		);
		writeFileSync(
			hostEntryPath,
			[
				'export default () => "host-entry";',
				"export const config = { identity: { id: 'intro-host', file: '/app/src/content/docs/intro.mdx', integration: 'ecopages-jsx' } };",
				'',
			].join('\n'),
		);
		writeFileSync(
			asyncEntryPath,
			[
				'export default async () => {',
				"\tthrow new Error('async-component-ran');",
				'};',
				"export const config = { identity: { id: 'intro-async', file: '/app/src/content/docs/intro.async.mdx', integration: 'react' } };",
				'',
			].join('\n'),
		);

		const serverModule = renderCollectionComponentsModule('docs', cacheDir, [
			{
				entry: { title: 'Intro React', description: 'Welcome', slug: 'intro-react', segments: ['intro-react'] },
				filePath: reactEntryPath,
			},
			{
				entry: { title: 'Intro Host', description: 'Welcome', slug: 'intro-host', segments: ['intro-host'] },
				filePath: hostEntryPath,
			},
			{
				entry: { title: 'Intro Async', description: 'Welcome', slug: 'intro-async', segments: ['intro-async'] },
				filePath: asyncEntryPath,
			},
		]);
		const serverModulePath = join(cacheDir, 'docs.server.mts');
		writeFileSync(serverModulePath, serverModule);

		try {
			const loaded = (await import(serverModulePath)) as {
				getComponent: (slug: string) => Promise<EcoComponent<Record<string, unknown>>>;
			};
			const reactComponent = await loaded.getComponent('intro-react');
			const hostComponent = await loaded.getComponent('intro-host');
			const asyncComponent = await loaded.getComponent('intro-async');
			const render = (component: EcoComponent<Record<string, unknown>>) =>
				(component as unknown as (props: Record<string, unknown>) => Promise<unknown> | unknown)({});

			await expect(
				runWithComponentRenderContext({ currentIntegration: 'ecopages-jsx' }, async () =>
					render(reactComponent),
				),
			).rejects.toThrow(/owned by the "react" integration/);

			await expect(
				runWithComponentRenderContext({ currentIntegration: 'react' }, async () => render(hostComponent)),
			).rejects.toThrow(/owned by the "ecopages-jsx" integration/);

			await expect(
				runWithComponentRenderContext({ currentIntegration: 'ecopages-jsx' }, async () =>
					render(asyncComponent),
				),
			).rejects.toThrow(/owned by the "react" integration/);
			await expect(
				runWithComponentRenderContext({ currentIntegration: 'react' }, async () => render(asyncComponent)),
			).rejects.toThrow(/async-component-ran/);

			await expect(
				runWithComponentRenderContext({ currentIntegration: 'react' }, async () => render(reactComponent)),
			).resolves.toEqual({ value: 'react-entry' });
			await expect(
				runWithComponentRenderContext({ currentIntegration: 'ecopages-jsx' }, async () =>
					render(hostComponent),
				),
			).resolves.toEqual({ value: 'host-entry' });

			await expect(render(reactComponent)).toBeDefined();
		} finally {
			rmSync(tempDir, { force: true, recursive: true });
		}
	});
});
