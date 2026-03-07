/**
 * Runtime bundle service for React integration.
 *
 * Owns creation of the browser runtime assets for React and React DOM,
 * including temporary entry generation, specifier mapping, and React DOM
 * interop rewriting.
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { type AssetDefinition, AssetFactory } from '@ecopages/core/services/asset-processing-service';
import type { ReactRouterAdapter } from '../router-adapter.ts';

type RuntimeModuleConfig = {
	specifier: string;
	defaultExport?: boolean;
};

export type ReactRuntimeImports = {
	react: string;
	reactDomClient: string;
	reactJsxRuntime: string;
	reactJsxDevRuntime: string;
	reactDom: string;
	router?: string;
};

export interface ReactRuntimeBundleServiceConfig {
	routerAdapter?: ReactRouterAdapter;
}

export class ReactRuntimeBundleService {
	constructor(private readonly config: ReactRuntimeBundleServiceConfig) {}

	getRuntimeImports(): ReactRuntimeImports {
		const runtimeImports: ReactRuntimeImports = {
			react: this.buildImportMapSourceUrl('react.js'),
			reactDomClient: this.buildImportMapSourceUrl('react-dom.js'),
			reactJsxRuntime: this.buildImportMapSourceUrl('react.js'),
			reactJsxDevRuntime: this.buildImportMapSourceUrl('react.js'),
			reactDom: this.buildImportMapSourceUrl('react-dom.js'),
		};

		if (this.config.routerAdapter) {
			runtimeImports.router = this.buildImportMapSourceUrl(`${this.config.routerAdapter.bundle.outputName}.js`);
		}

		return runtimeImports;
	}

	getSpecifierMap(): Record<string, string> {
		const runtimeImports = this.getRuntimeImports();
		const map: Record<string, string> = {
			react: runtimeImports.react,
			'react/jsx-runtime': runtimeImports.reactJsxRuntime,
			'react/jsx-dev-runtime': runtimeImports.reactJsxDevRuntime,
			'react-dom': runtimeImports.reactDom,
			'react-dom/client': runtimeImports.reactDomClient,
		};

		if (this.config.routerAdapter && runtimeImports.router) {
			map[this.config.routerAdapter.importMapKey] = runtimeImports.router;
		}

		return map;
	}

	getDependencies(): AssetDefinition[] {
		const runtimeAttrs = { type: 'module', defer: '' } as const;
		const runtimeImports = this.getRuntimeImports();
		const reactRuntimeAliasPlugin = this.createRuntimeSpecifierAliasPlugin({
			react: runtimeImports.react,
		});
		const reactDomRuntimeInteropPlugin = this.createReactDomRuntimeInteropPlugin();

		const reactEntry = this.createRuntimeEntry(
			[
				{ specifier: 'react', defaultExport: true },
				{ specifier: 'react/jsx-runtime' },
				{ specifier: 'react/jsx-dev-runtime' },
			],
			'react-entry.mjs',
		);
		const reactDomEntry = this.createRuntimeEntry(
			[{ specifier: 'react-dom', defaultExport: true }, { specifier: 'react-dom/client' }],
			'react-dom-entry.mjs',
		);

		const dependencies: AssetDefinition[] = [
			AssetFactory.createNodeModuleScript({
				position: 'head',
				importPath: reactEntry,
				name: 'react',
				excludeFromHtml: true,
				bundleOptions: { naming: 'react.js' },
				attributes: runtimeAttrs,
			}),
			AssetFactory.createNodeModuleScript({
				position: 'head',
				importPath: reactDomEntry,
				name: 'react-dom',
				excludeFromHtml: true,
				bundleOptions: {
					naming: 'react-dom.js',
					plugins: [reactRuntimeAliasPlugin, reactDomRuntimeInteropPlugin],
				},
				attributes: runtimeAttrs,
			}),
		];

		if (this.config.routerAdapter) {
			const runtimeAliasPlugin = this.createRuntimeAliasPlugin();
			const mappedSpecifiers = new Set(Object.keys(this.getSpecifierMap()));
			const unresolvedExternals = this.config.routerAdapter.bundle.externals.filter(
				(external) => !mappedSpecifiers.has(external),
			);

			dependencies.push(
				AssetFactory.createNodeModuleScript({
					position: 'head',
					importPath: this.config.routerAdapter.bundle.importPath,
					name: this.config.routerAdapter.bundle.outputName,
					excludeFromHtml: true,
					bundleOptions: {
						naming: `${this.config.routerAdapter.bundle.outputName}.js`,
						external: unresolvedExternals,
						plugins: [runtimeAliasPlugin],
					},
					attributes: runtimeAttrs,
				}),
			);
		}

		return dependencies;
	}

	createRuntimeAliasPlugin(): EcoBuildPlugin {
		const specifierMap = this.getSpecifierMap();
		const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const filter = new RegExp(
			`^(${Object.keys(specifierMap)
				.map((key) => escapeRegExp(key))
				.join('|')})$`,
		);

		return {
			name: 'react-plugin-runtime-alias',
			setup(build) {
				build.onResolve({ filter }, (args) => {
					const mappedPath = specifierMap[args.path];
					if (!mappedPath) {
						return undefined;
					}

					return {
						path: mappedPath,
						external: true,
					};
				});
			},
		};
	}

	private buildImportMapSourceUrl(fileName: string): string {
		return `/${AssetFactory.RESOLVED_ASSETS_VENDORS_DIR}/${fileName}`;
	}

	private createRuntimeSpecifierAliasPlugin(specifierMap: Record<string, string>, external = true): EcoBuildPlugin {
		const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const filter = new RegExp(
			`^(${Object.keys(specifierMap)
				.map((key) => escapeRegExp(key))
				.join('|')})$`,
		);

		return {
			name: 'react-plugin-runtime-specifier-alias',
			setup(build) {
				build.onResolve({ filter }, (args) => {
					const mappedPath = specifierMap[args.path];
					if (!mappedPath) {
						return undefined;
					}

					return {
						path: mappedPath,
						external,
					};
				});
			},
		};
	}

	private createReactDomRuntimeInteropPlugin(): EcoBuildPlugin {
		const reactDomFileFilter = /[\\/]react-dom[\\/].*\.js$/;
		const reactRequirePattern = /\brequire\((['"])react\1\)/g;

		return {
			name: 'react-dom-runtime-interop',
			setup(build) {
				build.onLoad({ filter: reactDomFileFilter }, (args) => {
					const content = fs.readFileSync(args.path, 'utf-8');
					if (!reactRequirePattern.test(content)) {
						return undefined;
					}

					reactRequirePattern.lastIndex = 0;
					const rewritten = content.replace(reactRequirePattern, '__ecopages_react_runtime');

					return {
						contents: `import * as __ecopages_react_runtime from 'react';\n${rewritten}`,
						loader: 'js',
						resolveDir: path.dirname(args.path),
					};
				});
			},
		};
	}

	private getRuntimeArtifactsDir(): string {
		const tmpDir = path.join(process.cwd(), 'node_modules', '.cache', 'ecopages-react-runtime');
		fs.mkdirSync(tmpDir, { recursive: true });
		return tmpDir;
	}

	private createRuntimeEntry(modules: RuntimeModuleConfig[], fileName: string): string {
		const tmpDir = this.getRuntimeArtifactsDir();
		const requireFromRoot = createRequire(path.join(process.cwd(), 'package.json'));
		const seenExports = new Set<string>();
		const statements: string[] = [];

		for (const module of modules) {
			if (module.defaultExport) {
				statements.push(`import __ecopages_default_export__ from '${module.specifier}';`);
				statements.push('export default __ecopages_default_export__;');
			}

			const exportNames = this.getModuleExportNames(module.specifier, requireFromRoot).filter(
				(name) => !seenExports.has(name),
			);

			if (exportNames.length > 0) {
				statements.push(`export { ${exportNames.join(', ')} } from '${module.specifier}';`);
				for (const exportName of exportNames) {
					seenExports.add(exportName);
				}
			}
		}

		const filePath = path.join(tmpDir, fileName);
		fs.writeFileSync(filePath, statements.join('\n'), 'utf-8');
		return filePath;
	}

	private getModuleExportNames(specifier: string, requireFromRoot: ReturnType<typeof createRequire>): string[] {
		const moduleExports = requireFromRoot(specifier);

		return Object.keys(moduleExports)
			.filter((name) => name !== '__esModule' && name !== 'default')
			.filter((name) => this.isValidExportName(name))
			.sort();
	}

	private isValidExportName(name: string): boolean {
		return /^[$A-Z_a-z][$\w]*$/.test(name);
	}
}
