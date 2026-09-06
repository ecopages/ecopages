import { describe, expect, it } from 'vitest';
import { eco } from './eco.ts';
import { bindComponentIdentity } from './component-identity.ts';
import { collectComponentDependencies } from '../route-renderer/page-loading/component-dependency-collection.ts';
import {
	collectDependencyWatchPaths,
	collectFileScopedDependencyComponents,
	collectPageDependencyComponents,
} from '../route-renderer/page-loading/file-scoped-dependency-components.ts';
import type { EcoComponent, EcoDeclaredComponent } from '../types/public-types.ts';
import { mergePageDependencies } from './page-dependency-contributions.ts';

function collect(components: EcoComponent[]) {
	return collectComponentDependencies({
		components,
		integrationName: 'lit',
		resolveLazyScripts: (_dir, scripts) => scripts.join(','),
		createEcopagesJsxLazyEntryName: (_, key) => key,
		isEcopagesJsxIntegration: () => false,
		errors: { invalidStylesheetEntry: 'style', invalidScriptEntry: 'script', lazyScriptMissingSrc: 'lazy' },
	});
}
const identity = (file: string) => ({ id: file, file: `/app/${file}`, integration: 'lit' });

describe('discovered dependency graph', () => {
	it('defers circular bindings and keeps separate components from one module', () => {
		const first: EcoDeclaredComponent = eco.component(
			bindComponentIdentity(
				identity('shared.ts'),
				{ render: () => '', dependencies: { stylesheets: ['./first.css'] } },
				{ components: () => [second], stylesheets: [] },
			),
		);
		const second: EcoDeclaredComponent = eco.component(
			bindComponentIdentity(
				identity('shared.ts'),
				{ render: () => '', dependencies: { stylesheets: ['./second.css'] } },
				{ components: () => [first], stylesheets: [] },
			),
		);
		expect(first.config?.dependencies?.components).toEqual([second]);
		expect(collect([first, second]).dependencies.filter((asset) => asset.kind === 'stylesheet')).toHaveLength(2);
		expect(collectDependencyWatchPaths('/app/shared.ts', [first])).toEqual([
			'/app/shared.ts',
			'/app/first.css',
			'/app/second.css',
		]);
	});
	it('preserves explicit stylesheet overrides across roots and appends inferred styles once', () => {
		const inferred = eco.component(
			bindComponentIdentity(
				identity('inferred.ts'),
				{ render: () => '' },
				{ components: () => [], stylesheets: ['./same.css', './extra.css'] },
			),
		);
		const explicit = eco.component(
			bindComponentIdentity(identity('explicit.ts'), {
				render: () => '',
				dependencies: { stylesheets: [{ src: './same.css', attributes: { media: 'print' } }, './last.css'] },
			}),
		);
		const styles = collect([inferred, explicit]).dependencies;
		expect(styles).toHaveLength(3);
		expect(styles[0]).toMatchObject({ filepath: '/app/same.css', attributes: { media: 'print' } });
		expect(styles[1]).toMatchObject({ filepath: '/app/last.css' });
		expect(styles[2]).toMatchObject({ filepath: '/app/extra.css' });
	});
	it('supports absolute paths in discovered stylesheets', () => {
		const inferred = eco.component(
			bindComponentIdentity(
				identity('inferred.ts'),
				{ render: () => '' },
				{ components: () => [], stylesheets: ['/global/styles/theme.css'] },
			),
		);
		const styles = collect([inferred]).dependencies;
		expect(styles).toHaveLength(1);
		expect(styles[0]).toMatchObject({ filepath: '/global/styles/theme.css' });
	});
	it('deduplicates explicit children and inferred children, ignoring utility values', () => {
		const child = eco.component(bindComponentIdentity(identity('child.ts'), { render: () => '' }));
		const owner = eco.page(
			bindComponentIdentity(
				identity('page.ts'),
				{ render: () => '', dependencies: { components: [child] } },
				{ components: () => [child, () => '', null], stylesheets: [] },
			),
		);
		expect(owner.config?.dependencies?.components).toEqual([child]);
	});
	it('keeps lazy SSR script policy on inferred children', () => {
		const child = eco.component(
			bindComponentIdentity(identity('child.ts'), {
				render: () => '',
				dependencies: { scripts: [{ src: './register.ts', ssr: true, lazy: { 'on:visible': true } }] },
			}),
		);
		const owner = eco.page(
			bindComponentIdentity(
				identity('page.ts'),
				{ render: () => '' },
				{ components: () => [child], stylesheets: [] },
			),
		);
		const result = collect([owner]);
		expect(result.lazyScriptsByConfig.has(child.config!)).toBe(true);
		expect(result.dependencies).toHaveLength(1);
		expect(result.dependencies[0]).toMatchObject({ excludeFromHtml: true });
	});
	it('allows dependency replacement while preserving live discovered references', () => {
		let child: EcoDeclaredComponent = eco.component(
			bindComponentIdentity(identity('old.ts'), { render: () => '' }),
		);
		const owner = eco.component(
			bindComponentIdentity(
				identity('owner.ts'),
				{ render: () => '' },
				{ components: () => [child], stylesheets: ['./owner.css'] },
			),
		);
		child = eco.component(bindComponentIdentity(identity('new.ts'), { render: () => '' }));
		owner.config!.dependencies = { scripts: ['./explicit.ts'] };
		expect(owner.config?.dependencies?.components).toEqual([child]);
		expect(owner.config?.dependencies?.scripts).toEqual(['./explicit.ts']);
		expect(owner.config?.dependencies?.stylesheets).toBeUndefined();
		expect(collect([owner]).dependencies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ filepath: '/app/owner.css' }),
				expect.objectContaining({ filepath: '/app/explicit.ts' }),
			]),
		);
	});
	it('keeps inferred styles off the public bag so copies cannot emit a second unconditional stylesheet', () => {
		const owner = eco.component(
			bindComponentIdentity(
				identity('owner.ts'),
				{
					render: () => '',
					dependencies: { stylesheets: [{ src: './same.css', attributes: { media: 'print' } }] },
				},
				{ components: () => [], stylesheets: ['./same.css'] },
			),
		);
		expect(owner.config?.dependencies?.stylesheets).toEqual([
			{ src: './same.css', attributes: { media: 'print' } },
		]);
		const copied = collectFileScopedDependencyComponents({
			ownerFile: '/app/owner.ts',
			integrationName: 'lit',
			dependencies: { ...owner.config!.dependencies },
		});
		const fromCopy = collect(copied).dependencies;
		const fromOwner = collect([owner]).dependencies;
		expect(fromCopy).toHaveLength(1);
		expect(fromCopy[0]).toMatchObject({ filepath: '/app/same.css', attributes: { media: 'print' } });
		expect(fromOwner).toHaveLength(1);
		expect(fromOwner[0]).toMatchObject({ filepath: '/app/same.css', attributes: { media: 'print' } });
	});
	it('treats stylesheets appended after discovery as explicit', () => {
		const owner = eco.component(
			bindComponentIdentity(
				identity('owner.ts'),
				{
					render: () => '',
					dependencies: { stylesheets: [{ src: './same.css', attributes: { media: 'print' } }] },
				},
				{ components: () => [], stylesheets: ['./same.css'] },
			),
		);
		owner.config!.dependencies = {
			stylesheets: [...(owner.config!.dependencies?.stylesheets ?? []), './appended.css'],
		};
		const styles = collect([owner]).dependencies;
		expect(styles).toHaveLength(2);
		expect(styles[0]).toMatchObject({ filepath: '/app/same.css', attributes: { media: 'print' } });
		expect(styles[1]).toMatchObject({ filepath: '/app/appended.css' });
	});
	it('resolves merged page and content stylesheets against each owner file', () => {
		const merged = mergePageDependencies(
			{ stylesheets: ['./page.css'] },
			{ stylesheets: ['./post.css'], ownerFile: '/app/content/post.mdx' },
		);
		const components = collectPageDependencyComponents({
			result: merged!,
			fallbackOwnerFile: '/app/pages/posts/[slug].tsx',
			integrationName: 'lit',
		});
		const styles = collect(components).dependencies;
		expect(styles).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ filepath: '/app/pages/posts/page.css' }),
				expect.objectContaining({ filepath: '/app/content/post.css' }),
			]),
		);
		expect(styles).toHaveLength(2);
	});
	it('keeps inferred-only entry styles through getEntryDependencies when a child overrides the same file', () => {
		const child = eco.component(
			bindComponentIdentity(identity('child.ts'), {
				render: () => '',
				dependencies: { stylesheets: [{ src: './same.css', attributes: { media: 'print' } }] },
			}),
		);
		const entry = eco.component(
			bindComponentIdentity(
				identity('post.mdx'),
				{ render: () => '' },
				{ components: () => [child], stylesheets: ['./same.css', './extra.css'] },
			),
		);
		expect(entry.config?.dependencies?.stylesheets).toBeUndefined();

		const getEntryDependencies = (component: EcoComponent) => ({ components: [component] });
		const components = collectPageDependencyComponents({
			result: getEntryDependencies(entry),
			fallbackOwnerFile: '/app/pages/posts/[slug].tsx',
			integrationName: 'lit',
		});
		const styles = collect(components).dependencies;
		expect(styles).toHaveLength(2);
		expect(styles[0]).toMatchObject({ filepath: '/app/same.css', attributes: { media: 'print' } });
		expect(styles[1]).toMatchObject({ filepath: '/app/extra.css' });
	});
});
