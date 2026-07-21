import { createHash } from 'node:crypto';
import path from 'node:path';

import { fileSystem } from '@ecopages/file-system';
import { BrowserBundleService } from '../../services/assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { createDevTransformExternalizeImportsPlugin } from './dev-transform-externalize-plugin.ts';
import { rewriteModuleImports } from './dev-transform-import-rewriter.ts';
import type { DevTransformVendorRegistry } from './dev-transform-vendor-registry.ts';
import type { DevTransformBundleContributor, DevTransformBundleResult } from './types.ts';

export type DevTransformBundlerOptions = {
	appConfig: EcoPagesAppConfig;
	contributors?: readonly DevTransformBundleContributor[];
	getRuntimeSpecifierMap: () => ReadonlyMap<string, string>;
	vendorRegistry: DevTransformVendorRegistry;
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

	constructor(options: DevTransformBundlerOptions) {
		this.appConfig = options.appConfig;
		this.browserBundleService = new BrowserBundleService(options.appConfig);
		this.getRuntimeSpecifierMap = options.getRuntimeSpecifierMap;
		this.vendorRegistry = options.vendorRegistry;
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
		const entryKey = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
		const result = await this.browserBundleService.bundle({
			profile: 'hmr-entrypoint',
			entrypoints: { [entryKey]: normalized },
			outdir: tempDir,
			naming: '[name].js',
			plugins: [createDevTransformExternalizeImportsPlugin(), ...pagePlugins],
			minify: false,
		});

		if (!result.success) {
			const details = result.logs.map((log) => log.message).join('\n');
			throw new Error(
				details
					? `[dev-transform] Transpile failed for ${normalized}:\n${details}`
					: `[dev-transform] Transpile failed for ${normalized}`,
			);
		}

		const outputPath =
			result.entryOutputs?.[normalized] ??
			result.outputs.find((output) => path.basename(output.path) === `${entryKey}.js`)?.path ??
			result.outputs[0]?.path;
		if (!outputPath) {
			throw new Error(`[dev-transform] No transpile output for ${normalized}`);
		}

		const transpiledCode = fileSystem.readFileSync(outputPath);
		const rewritten = await rewriteModuleImports({
			code: transpiledCode,
			sourcePath: normalized,
			srcDir: this.appConfig.absolutePaths.srcDir,
			projectRoot: this.appConfig.rootDir,
			runtimeSpecifierMap: this.getRuntimeSpecifierMap(),
			resolveVendorUrl: (specifier) => this.vendorRegistry.resolveVendorUrl(specifier),
		});

		return {
			code: rewritten.code,
			dependencies: rewritten.dependencies,
		};
	}
}
