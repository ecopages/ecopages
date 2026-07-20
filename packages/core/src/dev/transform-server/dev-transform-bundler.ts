import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { BrowserBundleService } from '../../services/assets/browser-bundle.service.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { DevTransformBundleContributor, DevTransformBundleResult } from './types.ts';

export type DevTransformBundlerOptions = {
	appConfig: EcoPagesAppConfig;
	contributors?: readonly DevTransformBundleContributor[];
};

/**
 * Bundles one dev client entrypoint with Rolldown (in-memory read after emit).
 */
export class DevTransformBundler {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly browserBundleService: BrowserBundleService;
	private readonly contributors: DevTransformBundleContributor[] = [];

	constructor(options: DevTransformBundlerOptions) {
		this.appConfig = options.appConfig;
		this.browserBundleService = new BrowserBundleService(options.appConfig);
		this.contributors.push(...(options.contributors ?? []));
	}

	addContributor(contributor: DevTransformBundleContributor): void {
		this.contributors.push(contributor);
	}

	private selectContributor(entrypointPath: string): DevTransformBundleContributor | undefined {
		return this.contributors.find((contributor) => contributor.ownsEntrypoint(entrypointPath));
	}

	private resolveTempOutdir(): string {
		const distDir = this.appConfig.absolutePaths?.distDir ?? path.join(this.appConfig.rootDir, '.eco', 'assets');
		return path.join(distDir, '.dev-transform');
	}

	async bundleEntrypoint(entrypointPath: string): Promise<DevTransformBundleResult> {
		const normalized = path.resolve(entrypointPath);
		const contributor = this.selectContributor(normalized);
		const pagePlugins = contributor ? await contributor.getPageBuildPlugins(normalized) : [];
		const tempDir = this.resolveTempOutdir();
		fileSystem.ensureDir(tempDir);

		const result = await this.browserBundleService.bundle({
			profile: 'hmr-entrypoint',
			entrypoints: [normalized],
			outdir: tempDir,
			naming: '[name].[hash].tmp',
			plugins: [...pagePlugins],
			minify: false,
			splitting: false,
		});

		if (!result.success) {
			throw new Error(`[dev-transform] Build failed for ${normalized}`);
		}

		const tempPath = result.outputs[0]?.path;
		if (!tempPath) {
			throw new Error(`[dev-transform] No output for ${normalized}`);
		}

		const resolvedPath = await resolveRolldownTempOutputPath(tempPath);
		if (!resolvedPath) {
			throw new Error(`[dev-transform] Missing temp output for ${normalized}: ${tempPath}`);
		}

		const dependencies = result.dependencyGraph?.entrypoints[normalized];

		return {
			code: fileSystem.readFileSync(resolvedPath),
			dependencies,
		};
	}
}

async function resolveRolldownTempOutputPath(tempPath: string): Promise<string | null> {
	if (fileSystem.exists(tempPath)) {
		return tempPath;
	}

	if (!tempPath.includes('[hash]')) {
		return null;
	}

	const directory = path.dirname(tempPath);
	const pattern = path.basename(tempPath).replaceAll('[hash]', '*');
	const matches = await fileSystem.glob([pattern], { cwd: directory });
	if (matches.length === 0) {
		return null;
	}

	return path.isAbsolute(matches[0]!) ? matches[0]! : path.join(directory, matches[0]!);
}
