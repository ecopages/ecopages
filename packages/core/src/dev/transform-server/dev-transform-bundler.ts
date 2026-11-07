import { contentHash } from '../../utils/content-hash.ts';
import { path } from '@ecopages/file-system/path';

import { fileSystem } from '@ecopages/file-system';
import { BrowserBundleService } from '../../assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { createDevTransformExternalizeImportsPlugin } from './dev-transform-externalize-plugin.ts';
import { rewriteModuleImports } from './dev-transform-import-rewriter.ts';
import { getDevelopmentStylesheetService } from '../stylesheets/development-stylesheet.service.ts';
import type { DevTransformVendorRegistry } from './dev-transform-vendor-registry.ts';
import type { DevTransformBundleContributor, DevTransformBundleResult } from './types.ts';
import { collectBuildEntryInputPaths, getBuildEntryOutput } from '../../build/build-graph.ts';
import { assertBuildSucceeded } from '../../build/build-log.ts';

export type DevTransformBundlerOptions = {
	appConfig: EcoPagesAppConfig;
	contributors?: readonly DevTransformBundleContributor[];
	vendorRegistry: DevTransformVendorRegistry;
	extraModuleRoots?: readonly string[];
};

/**
 * Transpiles one dev client module at a time to browser ESM with rewritten imports.
 */
export class DevTransformBundler {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly browserBundleService: BrowserBundleService;
	private readonly vendorRegistry: DevTransformVendorRegistry;
	private readonly contributors: DevTransformBundleContributor[] = [];
	private readonly extraModuleRoots: readonly string[];

	constructor(options: DevTransformBundlerOptions) {
		this.appConfig = options.appConfig;
		this.browserBundleService = new BrowserBundleService(options.appConfig);
		this.vendorRegistry = options.vendorRegistry;
		this.extraModuleRoots = options.extraModuleRoots ?? [];
		this.contributors.push(...(options.contributors ?? []));
	}

	addContributor(contributor: DevTransformBundleContributor): void {
		this.contributors.push(contributor);
	}

	private selectContributor(sourcePath: string): DevTransformBundleContributor | undefined {
		return this.contributors.find((contributor) => contributor.ownsModule(sourcePath));
	}

	private resolveTempOutdir(): string {
		const distDir = this.appConfig.absolutePaths?.distDir ?? path.join(this.appConfig.rootDir, '.eco', 'assets');
		return path.join(distDir, '.dev-transform');
	}

	/**
	 * Rewrites the imports of browser ESM `code` whose source is `sourcePath`; see {@link rewriteModuleImports}.
	 *
	 * @remarks
	 * A stylesheet import is versioned by the output the development stylesheet service last produced for it, so an
	 * edit to one of its `@import` partials gives the importer a new URL.
	 */
	rewriteImports(code: string, sourcePath: string): Promise<{ code: string; dependencies: string[] }> {
		return rewriteModuleImports({
			code,
			sourcePath,
			srcDir: this.appConfig.absolutePaths.srcDir,
			projectRoot: this.appConfig.rootDir,
			extraModuleRoots: this.extraModuleRoots,
			resolveVendorImport: (specifier) => this.vendorRegistry.resolveVendorImport(specifier, sourcePath),
			moduleVersion: (resolvedPath) => getDevelopmentStylesheetService(this.appConfig).version(resolvedPath),
		});
	}

	async transpileModule(sourcePath: string): Promise<DevTransformBundleResult> {
		const normalized = path.resolve(sourcePath);
		const contributor = this.selectContributor(normalized);
		const pagePlugins = contributor ? await contributor.getModulePlugins(normalized) : [];
		const tempDir = this.resolveTempOutdir();
		fileSystem.ensureDir(tempDir);

		/**
		 * @remarks
		 * Entry key is a path hash so concurrent transpiles of different modules that
		 * share a basename (e.g. multiple `index.tsx`) never collide on disk output.
		 */
		const entryKey = contentHash(normalized, 16);
		const result = await this.browserBundleService.bundle({
			lane: 'hmr',
			entrypoints: { [entryKey]: normalized },
			outdir: tempDir,
			naming: '[name].js',
			plugins: [createDevTransformExternalizeImportsPlugin(), ...pagePlugins],
			minify: false,
			workerEntries: false,
		});

		assertBuildSucceeded(result, `[dev-transform] Transpile failed for ${normalized}`);

		const outputPath = getBuildEntryOutput(result, entryKey, this.appConfig.rootDir);
		if (!outputPath) {
			throw new Error(`[dev-transform] No transpile output for ${normalized}`);
		}

		const rewritten = await this.rewriteImports(fileSystem.readFileSync(outputPath), normalized);

		const inlinedInputs = collectBuildEntryInputPaths(result, normalized, this.appConfig.rootDir).filter(
			(filePath) => filePath !== normalized,
		);
		return {
			code: rewritten.code,
			dependencies: [...new Set([...rewritten.dependencies, ...inlinedInputs])],
		};
	}
}
