import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it } from 'vitest';
import { getAssetDependencyKey } from '../assets/asset-processing-service/asset-dependency-keys.ts';
import type { FileStylesheetAsset } from '../assets/asset-processing-service/assets.types.ts';
import { collectComponentDependencies } from '../route-renderer/page-loading/component-dependency-collection.ts';
import { bindComponentIdentity } from './component-identity.ts';
import { resolveDiscoveredStylesheets, resolveDiscoveredWatchFiles } from './discovered-dependency-paths.ts';
import { eco } from './eco.ts';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-discovered-paths-')));
	roots.push(root);
	return root;
}

/** Installs `some-lib` at `version` in a pnpm-style store folder of `root`, linked from `node_modules`. */
function installSomeLib(root: string, version: string): string {
	const packageDir = path.join(root, 'node_modules', '.pnpm', `some-lib@${version}`, 'node_modules', 'some-lib');
	mkdirSync(path.join(packageDir, 'css'), { recursive: true });
	writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'some-lib', version }));
	writeFileSync(path.join(packageDir, 'css', 'style.css'), '.some-lib {}');
	symlinkSync(packageDir, path.join(root, 'node_modules', 'some-lib'), 'junction');
	return packageDir;
}

/** A component as the meta transform emits it: root-relative files and the package path of a package stylesheet. */
function badgeComponent() {
	return eco.component(
		bindComponentIdentity(
			{ id: 'badge', file: 'src/components/badge.ts', integration: 'lit' },
			{ render: () => '' },
			{
				components: () => [],
				stylesheets: ['src/components/badge.css', 'src/components|some-lib@1.0.0/css/style.css'],
				packageStylesheets: ['src/components|some-lib@1.0.0/css/style.css'],
				watchFiles: ['src/components/card.ts'],
			},
		),
	);
}

function collectPackageStylesheet(root: string, component: ReturnType<typeof badgeComponent>) {
	const { dependencies } = collectComponentDependencies({
		components: [component],
		integrationName: 'lit',
		rootDir: root,
		resolveLazyScripts: (_dir, scripts) => scripts.join(','),
		createEcopagesJsxLazyEntryName: (_, key) => key,
		errors: { invalidStylesheetEntry: 'style', invalidScriptEntry: 'script', lazyScriptMissingSrc: 'lazy' },
	});
	const stylesheet = dependencies.find(
		(asset) => asset.kind === 'stylesheet' && 'fromPackage' in asset && asset.fromPackage,
	);
	return { stylesheet: stylesheet as FileStylesheetAsset, key: getAssetDependencyKey(stylesheet!, root) };
}

describe('resolveDiscoveredStylesheets', () => {
	it('resolves root-relative stylesheets and watch files against the app root they are loaded in', () => {
		const root = tempRoot();
		const config = badgeComponent().config;

		const { imported, packagePaths } = resolveDiscoveredStylesheets(config, root);

		expect(imported[0]).toBe(path.join(root, 'src', 'components', 'badge.css'));
		expect([...packagePaths.values()]).toEqual(['some-lib@1.0.0/css/style.css']);
		expect(resolveDiscoveredWatchFiles(config, root)).toEqual([path.join(root, 'src', 'components', 'card.ts')]);
	});
});

describe('a package stylesheet after a dependency version bump', () => {
	it('resolves to the new store folder and keeps its dependency key', () => {
		const root = tempRoot();
		const component = badgeComponent();
		const before = installSomeLib(root, '1.0.0');
		const first = collectPackageStylesheet(root, component);
		expect(first.stylesheet).toMatchObject({
			filepath: path.join(before, 'css', 'style.css'),
			fromPackage: 'some-lib@1.0.0/css/style.css',
		});

		unlinkSync(path.join(root, 'node_modules', 'some-lib'));
		renameSync(path.join(root, 'node_modules', '.pnpm', 'some-lib@1.0.0'), path.join(root, 'removed'));
		const after = installSomeLib(root, '2.0.0');
		const second = collectPackageStylesheet(root, component);

		expect(second.stylesheet.filepath).toBe(path.join(after, 'css', 'style.css'));
		expect(second.key).toBe(first.key);
	});
});

describe('a dependency at two versions', () => {
	it('resolves each from the folder of its importing module, as two files with two keys', () => {
		const root = tempRoot();
		const install = (dir: string, version: string) => {
			const packageDir = path.join(root, dir, 'node_modules', 'dep');
			mkdirSync(packageDir, { recursive: true });
			writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'dep', version }));
			writeFileSync(path.join(packageDir, 'x.css'), '.dep {}');
			return packageDir;
		};
		const appDep = install('.', '2.0.0');
		const workspaceDep = install(path.join('packages', 'ui'), '1.0.0');
		const page = eco.component(
			bindComponentIdentity(
				{ id: 'page', file: 'src/page.ts', integration: 'lit' },
				{ render: () => '' },
				{
					components: () => [],
					stylesheets: ['src|dep@2.0.0/x.css'],
					plainModuleStylesheets: ['packages/ui|dep@1.0.0/x.css'],
					packageStylesheets: ['src|dep@2.0.0/x.css', 'packages/ui|dep@1.0.0/x.css'],
				},
			),
		);

		const { dependencies } = collectComponentDependencies({
			components: [page],
			integrationName: 'lit',
			rootDir: root,
			resolveLazyScripts: (_dir, scripts) => scripts.join(','),
			createEcopagesJsxLazyEntryName: (_, key) => key,
			errors: { invalidStylesheetEntry: 'style', invalidScriptEntry: 'script', lazyScriptMissingSrc: 'lazy' },
		});
		const stylesheets = dependencies as FileStylesheetAsset[];

		expect(stylesheets.map((asset) => [asset.filepath, asset.fromPackage])).toEqual([
			[path.join(appDep, 'x.css'), 'dep@2.0.0/x.css'],
			[path.join(workspaceDep, 'x.css'), 'dep@1.0.0/x.css'],
		]);
		expect(getAssetDependencyKey(stylesheets[0]!, root)).not.toBe(getAssetDependencyKey(stylesheets[1]!, root));
	});
});
