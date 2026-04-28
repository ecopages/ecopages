/**
 * Runtime bundle service for the JSX integration.
 *
 * Owns creation of browser runtime vendor assets, the import map specifier
 * mapping, and the build external plugin. Radiant sub-path specifiers are
 * derived at runtime from `@ecopages/radiant/package.json` exports so the
 * list stays in sync with whatever version is installed.
 *
 * @module
 */

import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { createRuntimeSpecifierAliasPlugin } from '@ecopages/core/build/runtime-specifier-alias-plugin';
import {
	BROWSER_RUNTIME_SCRIPT_ATTRIBUTES,
	buildBrowserRuntimeAssetUrl,
	createBrowserRuntimeScriptAsset,
	AssetFactory,
	type AssetDefinition,
} from '@ecopages/core/services/asset-processing-service';

const VENDOR_FILE_NAMES = {
	jsx: 'ecopages-jsx-esm.js',
	radiant: 'ecopages-radiant-esm.js',
} as const;

export const RADIANT_HYDRATOR_BOOTSTRAP_ATTRIBUTE = 'data-ecopages-jsx-radiant-hydrator';

export interface JsxRuntimeBundleServiceConfig {
	radiant: boolean;
	rootDir?: string;
}

type RadiantPackageJson = {
	exports?: Record<string, unknown>;
};

type BrowserRuntimeRadiantModule = {
	exportKey: string;
	modulePath: string;
};

type PackageExportTarget = string | { import?: string };

const JSX_RUNTIME_NAMESPACE_REPAIR_SNIPPET =
	'function rG(W,G,J){let j=G instanceof Element?G:G?.parentElement,U=j?.namespaceURI??K9,$=j?.localName,X=W.firstElementChild;if(!X)return;let F=J??X.localName,Z=O9(U,$,F);if(X.namespaceURI===Z&&X.localName===F)return;W.replaceChild(tG(X,Z,F),X)}function tG(W,G,J){let j=document.createElementNS(G,J);for(let U of Array.from(W.attributes)){if(U.namespaceURI){j.setAttributeNS(U.namespaceURI,U.name,U.value);continue}n(j,U.name,U.value)}return j.append(...W.childNodes),j}';

const JSX_RUNTIME_NAMESPACE_REPAIR_PATCH = [
	"const eopHtmlNamespace='http://www.w3.org/1999/xhtml',eopSvgNamespace='http://www.w3.org/2000/svg',eopCanonicalSvgLocalNames={altglyph:'altGlyph',altglyphdef:'altGlyphDef',altglyphitem:'altGlyphItem',animatemotion:'animateMotion',animatetransform:'animateTransform',clippath:'clipPath',feblend:'feBlend',fecolormatrix:'feColorMatrix',fecomponenttransfer:'feComponentTransfer',fecomposite:'feComposite',feconvolvematrix:'feConvolveMatrix',fediffuselighting:'feDiffuseLighting',fedisplacementmap:'feDisplacementMap',fedistantlight:'feDistantLight',fedropshadow:'feDropShadow',feflood:'feFlood',fefunca:'feFuncA',fefuncb:'feFuncB',fefuncg:'feFuncG',fefuncr:'feFuncR',fegaussianblur:'feGaussianBlur',feimage:'feImage',femerge:'feMerge',femergenode:'feMergeNode',femorphology:'feMorphology',feoffset:'feOffset',fepointlight:'fePointLight',fespecularlighting:'feSpecularLighting',fespotlight:'feSpotLight',fetile:'feTile',feturbulence:'feTurbulence',foreignobject:'foreignObject',glyphref:'glyphRef',lineargradient:'linearGradient',radialgradient:'radialGradient',textpath:'textPath'};",
	'function eopGetCanonicalSvgLocalName(W){return eopCanonicalSvgLocalNames[W]??W}',
	'function eopIsSvgNamespace(W){return W===eopSvgNamespace}',
	'function rG(W,G,J){let j=G instanceof Element?G:G?.parentElement,U=j?.namespaceURI??K9,$=j?.localName;eopRepairNamespaceFragment(W,U??eopHtmlNamespace,$,J)}',
	'function eopRepairNamespaceFragment(W,G,J,j){let U=W.firstElementChild;if(!U)return;let $=j??U.localName,X=O9(G,J,$),F=eopIsSvgNamespace(X)?eopGetCanonicalSvgLocalName($):$;eopRepairNamespaceElement(W,U,X,F)}',
	'function eopRepairNamespaceElement(W,G,J,j){let U=G;if(G.namespaceURI!==J||G.localName!==j)U=tG(G,J,j),W.replaceChild(U,G);eopRepairNamespaceChildren(U,J,j)}',
	'function eopRepairNamespaceChildren(W,G,J){for(let j of Array.from(W.children)){let U=O9(G,J,j.localName),$=eopIsSvgNamespace(U)?eopGetCanonicalSvgLocalName(j.localName):j.localName,X=j;if(j.namespaceURI!==U||j.localName!==$)X=tG(j,U,$),W.replaceChild(X,j);eopRepairNamespaceChildren(X,U,$)}}',
	'function tG(W,G,J){let j=document.createElementNS(G,eopIsSvgNamespace(G)?eopGetCanonicalSvgLocalName(J):J);for(let U of Array.from(W.attributes)){if(U.namespaceURI){j.setAttributeNS(U.namespaceURI,U.name,U.value);continue}n(j,U.name,U.value)}return j.append(...W.childNodes),j}',
].join('');

function getNamedExportNamesFromModuleSource(source: string): string[] {
	const exportNames = new Set<string>();

	for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
		for (const specifier of match[1].split(',')) {
			const trimmedSpecifier = specifier.trim();

			if (!trimmedSpecifier) {
				continue;
			}

			const aliasMatch = trimmedSpecifier.match(/(?:.+\s+as\s+)?([A-Z_a-z$][\w$]*)$/);

			if (aliasMatch?.[1] && aliasMatch[1] !== 'default') {
				exportNames.add(aliasMatch[1]);
			}
		}
	}

	for (const match of source.matchAll(
		/export\s+(?:async\s+)?(?:const|function|class|let|var)\s+([A-Z_a-z$][\w$]*)/g,
	)) {
		if (match[1] !== 'default') {
			exportNames.add(match[1]);
		}
	}

	return [...exportNames].sort();
}

function isBrowserRuntimeRadiantSpecifier(exportKey: string): boolean {
	if (exportKey === '.' || exportKey.startsWith('./context/')) {
		return true;
	}

	if (exportKey === './client/hydrator') {
		return true;
	}

	if (exportKey.startsWith('./decorators/') || exportKey.startsWith('./helpers/')) {
		return true;
	}

	return exportKey === './core/radiant-component' || exportKey === './core/radiant-element';
}

function replaceExactOnce(source: string, search: string, replacement: string, label: string): string {
	if (!source.includes(search)) {
		throw new Error(`Could not find ${label} in @ecopages/jsx browser runtime source`);
	}

	return source.replace(search, replacement);
}

function createPatchedJsxBrowserRuntimeSource(source: string): string {
	return replaceExactOnce(
		source,
		JSX_RUNTIME_NAMESPACE_REPAIR_SNIPPET,
		JSX_RUNTIME_NAMESPACE_REPAIR_PATCH,
		'SVG namespace repair snippet',
	);
}

function findPackageManifestPath(packageName: string): string {
	let currentDir = path.dirname(new URL(import.meta.url).pathname);

	while (true) {
		const candidatePath = path.join(currentDir, 'node_modules', packageName, 'package.json');
		if (existsSync(candidatePath)) {
			return candidatePath;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}

		currentDir = parentDir;
	}

	throw new Error(`Could not locate ${packageName}/package.json from ${import.meta.url}`);
}

export class JsxRuntimeBundleService {
	private readonly config: JsxRuntimeBundleServiceConfig;
	private cachedSpecifierMap: Record<string, string> | undefined;
	private cachedJsxEntryModulePath: string | undefined;
	private cachedRadiantEntryModulePath: string | undefined;

	constructor(config: JsxRuntimeBundleServiceConfig) {
		this.config = config;
	}

	setRootDir(rootDir: string | undefined): void {
		this.config.rootDir = rootDir;
	}

	/**
	 * Returns the build plugin that aliases JSX and Radiant runtime specifiers to
	 * their emitted browser vendor URLs.
	 *
	 * @remarks
	 * The returned plugin both externalizes the mapped specifiers during bundle
	 * resolution and exposes alias metadata so Ecopages can rewrite any emitted JS
	 * imports that still reference bare runtime specifiers.
	 */
	getBuildPlugin(): EcoBuildPlugin {
		return createRuntimeSpecifierAliasPlugin(this.getOrCreateSpecifierMap(), {
			name: 'ecopages-jsx-runtime-alias',
		})!;
	}

	/**
	 * Builds the bare-specifier-to-vendor-URL map for the browser import map.
	 *
	 * JSX sub-paths are always included. When `radiant` is enabled, radiant
	 * sub-paths are derived from `@ecopages/radiant/package.json` exports and
	 * the result is cached for the lifetime of this service instance.
	 */
	async getSpecifierMap(): Promise<Record<string, string>> {
		return this.getOrCreateSpecifierMap();
	}

	/**
	 * Builds the full list of vendor asset definitions: the import map inline
	 * script plus one `createBrowserRuntimeScriptAsset` per vendor bundle.
	 */
	async getDependencies(): Promise<AssetDefinition[]> {
		const specifierMap = await this.getSpecifierMap();
		const jsxEntryModulePath = await this.getOrCreateJsxEntryModulePath();

		const deps: AssetDefinition[] = [
			AssetFactory.createInlineContentScript({
				position: 'head',
				bundle: false,
				content: JSON.stringify({ imports: specifierMap }, null, 2),
				attributes: { type: 'importmap' },
			}),
		];

		if (this.config.radiant) {
			deps.push(this.createRadiantHydratorBootstrapAsset());
		}

		deps.push(
			createBrowserRuntimeScriptAsset({
				importPath: jsxEntryModulePath,
				name: 'ecopages-jsx-esm',
				fileName: VENDOR_FILE_NAMES.jsx,
			}),
		);

		if (this.config.radiant) {
			const radiantEntryModulePath = await this.getOrCreateRadiantEntryModulePath();

			deps.push(
				createBrowserRuntimeScriptAsset({
					importPath: radiantEntryModulePath,
					name: 'ecopages-radiant-esm',
					fileName: VENDOR_FILE_NAMES.radiant,
				}),
			);
		}

		return deps;
	}

	private createRadiantHydratorBootstrapAsset(): AssetDefinition {
		return AssetFactory.createInlineContentScript({
			position: 'head',
			bundle: false,
			content: this.createRadiantHydratorBootstrapSource(),
			attributes: {
				...BROWSER_RUNTIME_SCRIPT_ATTRIBUTES,
				[RADIANT_HYDRATOR_BOOTSTRAP_ATTRIBUTE]: 'true',
			},
		});
	}

	private createRadiantHydratorBootstrapSource(): string {
		return [
			"import { installRadiantHydrator } from '@ecopages/radiant/client/hydrator';",
			'installRadiantHydrator();',
		].join('\n');
	}

	private getArtifactsDir(): string {
		const rootDir = this.config.rootDir ?? process.cwd();
		return path.join(rootDir, 'node_modules', '.cache', 'ecopages-browser-runtime');
	}

	private getEntryImportPath(fromDir: string, targetPath: string): string {
		const relativeModulePath = path.relative(fromDir, targetPath).split(path.sep).join('/');
		return relativeModulePath.startsWith('.') ? relativeModulePath : `./${relativeModulePath}`;
	}

	private getOrCreateSpecifierMap(): Record<string, string> {
		if (this.cachedSpecifierMap) {
			return this.cachedSpecifierMap;
		}

		const jsxVendorUrl = buildBrowserRuntimeAssetUrl(VENDOR_FILE_NAMES.jsx);
		const specifierMap: Record<string, string> = {
			'@ecopages/jsx': jsxVendorUrl,
			'@ecopages/jsx/client': jsxVendorUrl,
			'@ecopages/jsx/jsx-runtime': jsxVendorUrl,
			'@ecopages/jsx/jsx-dev-runtime': jsxVendorUrl,
		};

		if (this.config.radiant) {
			const radiantVendorUrl = buildBrowserRuntimeAssetUrl(VENDOR_FILE_NAMES.radiant);
			const radiantPkg = JSON.parse(
				readFileSync(findPackageManifestPath('@ecopages/radiant'), 'utf8'),
			) as RadiantPackageJson;

			for (const key of Object.keys(radiantPkg.exports ?? {})) {
				if (!isBrowserRuntimeRadiantSpecifier(key)) {
					continue;
				}

				const specifier = key === '.' ? '@ecopages/radiant' : `@ecopages/radiant${key.slice(1)}`;
				specifierMap[specifier] = radiantVendorUrl;
			}
		}

		this.cachedSpecifierMap = specifierMap;
		return specifierMap;
	}

	private async getOrCreateJsxEntryModulePath(): Promise<string> {
		if (this.cachedJsxEntryModulePath) {
			return this.cachedJsxEntryModulePath;
		}

		const artifactsDir = this.getArtifactsDir();
		const filePath = path.join(artifactsDir, 'ecopages-jsx-esm-entry.mjs');
		const manifestPath = findPackageManifestPath('@ecopages/jsx');
		const packageDir = path.dirname(realpathSync(manifestPath));
		const jsxPkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as RadiantPackageJson;
		const jsxModulePath = this.resolvePackageExportModulePath(
			packageDir,
			'.',
			jsxPkg.exports?.['.'] as PackageExportTarget,
		);
		const patchedRuntimeSource = createPatchedJsxBrowserRuntimeSource(readFileSync(jsxModulePath, 'utf8'));

		mkdirSync(artifactsDir, { recursive: true });
		writeFileSync(filePath, patchedRuntimeSource, 'utf8');

		this.cachedJsxEntryModulePath = filePath;
		return filePath;
	}

	private getRadiantBrowserRuntimeModules(): BrowserRuntimeRadiantModule[] {
		const manifestPath = findPackageManifestPath('@ecopages/radiant');
		const packageDir = path.dirname(realpathSync(manifestPath));
		const radiantPkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as RadiantPackageJson;

		return Object.entries(radiantPkg.exports ?? {})
			.filter(([key]) => isBrowserRuntimeRadiantSpecifier(key) && key !== '.')
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([exportKey, exportTarget]) => ({
				exportKey,
				modulePath: this.resolvePackageExportModulePath(
					packageDir,
					exportKey,
					exportTarget as PackageExportTarget,
				),
			}))
			.filter((module) => existsSync(module.modulePath));
	}

	private resolvePackageExportModulePath(
		packageDir: string,
		exportKey: string,
		exportTarget: PackageExportTarget | undefined,
	): string {
		if (typeof exportTarget === 'string') {
			return path.resolve(packageDir, exportTarget);
		}

		if (exportTarget && typeof exportTarget === 'object' && 'import' in exportTarget) {
			const importTarget = exportTarget.import;

			if (typeof importTarget === 'string') {
				return path.resolve(packageDir, importTarget);
			}
		}

		throw new Error(`Missing import target for @ecopages/radiant export ${exportKey}`);
	}

	private async getOrCreateRadiantEntryModulePath(): Promise<string> {
		if (this.cachedRadiantEntryModulePath) {
			return this.cachedRadiantEntryModulePath;
		}

		const artifactsDir = this.getArtifactsDir();
		const filePath = path.join(artifactsDir, 'ecopages-radiant-esm-entry.mjs');
		const seenExports = new Set<string>();
		const statements: string[] = [];

		mkdirSync(artifactsDir, { recursive: true });

		for (const module of this.getRadiantBrowserRuntimeModules()) {
			const exportNames = getNamedExportNamesFromModuleSource(readFileSync(module.modulePath, 'utf8'))
				.filter((name) => !seenExports.has(name))
				.filter((name) => /^[$A-Z_a-z][$\w]*$/.test(name))
				.sort();

			if (exportNames.length === 0) {
				continue;
			}

			const entryImportPath = this.getEntryImportPath(artifactsDir, module.modulePath);

			statements.push(`export { ${exportNames.join(', ')} } from '${entryImportPath}';`);

			for (const exportName of exportNames) {
				seenExports.add(exportName);
			}
		}

		writeFileSync(filePath, statements.join('\n'), 'utf8');
		this.cachedRadiantEntryModulePath = filePath;
		return filePath;
	}
}
