import { contentHash } from '../../utils/content-hash.ts';
import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { BrowserBundleService } from '../../assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { createDevTransformExternalizeImportsPlugin } from './dev-transform-externalize-plugin.ts';
import { rewriteModuleImports } from './dev-transform-import-rewriter.ts';
import type { DevTransformVendorRegistry } from './dev-transform-vendor-registry.ts';
import type { DevTransformBundleContributor, DevTransformBundleResult } from './types.ts';
import { getBuildEntryOutput } from '../../build/build-graph.ts';
import { assertBuildSucceeded } from '../../build/build-log.ts';

export type DevTransformBundlerOptions = {
	appConfig: EcoPagesAppConfig;
	contributors?: readonly DevTransformBundleContributor[];
	getRuntimeSpecifierMap: () => ReadonlyMap<string, string>;
	vendorRegistry: DevTransformVendorRegistry;
	extraModuleRoots?: readonly string[];
};

/**
 * Transpiles one dev client module at a time to browser ESM with rewritten imports.
 */
export class DevTransformBundler {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly browserBundleService: BrowserBundleService;
	private readonly getRuntimeSpecifierMap: () => ReadonlyMap<string, string>;
	private readonly vendorRegistry: DevTransformVendorRegistry;
	private readonly contributors: DevTransformBundleContributor[] = [];
	private readonly extraModuleRoots: readonly string[];

	constructor(options: DevTransformBundlerOptions) {
		this.appConfig = options.appConfig;
		this.browserBundleService = new BrowserBundleService(options.appConfig);
		this.getRuntimeSpecifierMap = options.getRuntimeSpecifierMap;
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
		});

		assertBuildSucceeded(result, `[dev-transform] Transpile failed for ${normalized}`);

		const outputPath = getBuildEntryOutput(result, entryKey, this.appConfig.rootDir);
		if (!outputPath) {
			throw new Error(`[dev-transform] No transpile output for ${normalized}`);
		}

		const transpiledCode = fileSystem.readFileSync(outputPath);
		const rewritten = await rewriteModuleImports({
			code: transpiledCode,
			sourcePath: normalized,
			srcDir: this.appConfig.absolutePaths.srcDir,
			projectRoot: this.appConfig.rootDir,
			extraModuleRoots: this.extraModuleRoots,
			runtimeSpecifierMap: this.getRuntimeSpecifierMap(),
			resolveVendorUrl: (specifier) => this.vendorRegistry.resolveVendorUrl(specifier),
		});

		return {
			code: rewritten.code,
			dependencies: rewritten.dependencies,
		};
	}
}
