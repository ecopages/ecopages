import path from 'node:path';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { resolveInternalExecutionDir } from '../utils/resolve-work-dir.ts';
import { getBuildEntryOutput } from './build-graph.ts';
import { buildOrThrow } from './runtime/build-queue.ts';
import { createServerBuildRequest } from './runtime/build-request-policy.ts';

/** Builds one server entry as an independent module and returns its emitted path. */
export async function buildServerModule(
	appConfig: EcoPagesAppConfig,
	input: {
		entrypoint: string;
		outputDirectory: string;
		outputFileName: string;
		failureMessage: string;
	},
): Promise<string> {
	const outputDirectory = path.join(resolveInternalExecutionDir(appConfig), input.outputDirectory);
	const buildRequest = createServerBuildRequest(appConfig, {
		entrypoints: [input.entrypoint],
		outdir: outputDirectory,
		naming: input.outputFileName.replace(/\.mjs$/u, '.[ext]'),
		splitting: false,
		externalPackages: true,
	});
	const result = await buildOrThrow(appConfig, buildRequest, input.failureMessage, 'nested');
	const outputPath = getBuildEntryOutput(result, input.entrypoint, appConfig.rootDir);

	if (!outputPath) {
		throw new Error(`No compiled output generated for server module: ${input.entrypoint}`);
	}

	return outputPath;
}
