import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { build, getAppBuildAdapter } from '../build/build-adapter.ts';
import type { BuildResult } from '../build/contracts/build-contracts.ts';
import { createServerBuildRequest } from '../build/runtime/build-request-policy.ts';
import { requireBuildRuntime } from '../build/runtime/build-runtime.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { getServerBundleOutputPaths } from '../build/cache/server-entry-build-cache.ts';
import { formatBuildLog } from '../build/build-log.ts';

export const EMITTED_ECO_CONFIG_FILENAME = 'eco.config.mjs';

export interface BundleEcoConfigModuleResult {
	emittedConfigPath: string;
	buildResult: BuildResult;
}

/**
 * Compiles the selected Ecopages config module for production server startup.
 */
export async function bundleEcoConfigModule(
	appConfig: EcoPagesAppConfig,
	options: { outputDir?: string; runtimeDir?: string } = {},
): Promise<BundleEcoConfigModuleResult | undefined> {
	const configSourcePath = appConfig.absolutePaths?.config;
	if (!configSourcePath || !fileSystem.exists(configSourcePath)) {
		return undefined;
	}

	const { serverOutdir } = getServerBundleOutputPaths(appConfig);
	const outputDir = options.outputDir ?? serverOutdir;
	const runtimeDir = options.runtimeDir ?? serverOutdir;
	const emittedConfigPath = path.join(outputDir, EMITTED_ECO_CONFIG_FILENAME);
	fileSystem.ensureDir(outputDir);

	const buildOptions = createServerBuildRequest(appConfig, {
		profile: 'server-entry',
		entrypoints: [configSourcePath],
		outdir: outputDir,
		naming: EMITTED_ECO_CONFIG_FILENAME,
		sourcemap: 'hidden',
		runtimeOutdir: runtimeDir,
	});

	const result = await build(buildOptions, requireBuildRuntime(appConfig).getProfile('server-entry'));
	if (!result.success) {
		const errorMessages = result.logs.map(formatBuildLog).join('\n');
		throw new Error(`Failed to bundle Ecopages config module:\n${errorMessages}`);
	}

	if (!fileSystem.exists(emittedConfigPath)) {
		throw new Error(`Ecopages config bundle missing at ${emittedConfigPath}`);
	}

	return {
		emittedConfigPath,
		buildResult: result,
	};
}

/**
 * @remarks
 * Ensures build ownership allows app-owned bundling before emitting config artifacts.
 */
export function assertCanBundleServerConfig(appConfig: EcoPagesAppConfig): void {
	const buildAdapter = getAppBuildAdapter(appConfig);
	if (buildAdapter.ownership === 'vite-host') {
		throw new Error(
			'Cannot bundle the server config: build ownership is "vite-host". ' +
				'The host runtime is expected to produce its own server bundle.',
		);
	}
}
