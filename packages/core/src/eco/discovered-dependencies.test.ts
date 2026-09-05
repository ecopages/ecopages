import { describe, expect, it } from 'vitest';
import { eco } from './eco.ts';
import { bindComponentIdentity } from './component-identity.ts';
import { collectComponentDependencies } from '../route-renderer/page-loading/component-dependency-collection.ts';
import { collectDependencyWatchPaths } from '../route-renderer/page-loading/file-scoped-dependency-components.ts';
import type { EcoComponent, EcoDeclaredComponent } from '../types/public-types.ts';

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
	});
});
