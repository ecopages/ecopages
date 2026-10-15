import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBuildRequestIdentity } from '../../build/runtime/build-request-identity.ts';
import { createServerBuildRequest } from '../../build/runtime/build-request-policy.ts';
import { buildOrThrow } from '../../build/runtime/build-queue.ts';
import { requireAppRuntime } from '../../config/app-runtime.ts';
import { recordCollectionBuild } from '../../diagnostics/request-pipeline-metrics.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';
import { fileSystem } from '@ecopages/file-system';
import { getBuildEntryOutput } from '../../build/build-graph.ts';

export type CollectionServerBuildArtifact = {
	collectionName: string;
	outputPath: string;
	outputUrl: string;
	sourcePaths: string[];
	buildIdentity: string;
	invalidationVersion: number;
};

function createCollectionBuildIdentity(
	buildRequestIdentity: string,
	sourceFilePath: string,
	ownedSourcePaths: readonly string[],
): string {
	const sourcePaths = [
		...new Set([sourceFilePath, ...ownedSourcePaths].map((sourcePath) => path.resolve(sourcePath))),
	].sort();
	const sourceIdentity = sourcePaths
		.map(
			(sourcePath) => `${sourcePath}\0${fileSystem.exists(sourcePath) ? fileSystem.hash(sourcePath) : 'missing'}`,
		)
		.join('\0');

	return createHash('sha256')
		.update('collection-server-build-v2\0')
		.update(buildRequestIdentity)
		.update('\0')
		.update(sourceIdentity)
		.digest('hex')
		.slice(0, 16);
}

/**
 * Builds one generated collection server module as an independent server unit.
 */
export async function buildCollectionServerModule(input: {
	appConfig: EcoPagesAppConfig;
	collectionName: string;
	sourceFilePath: string;
	ownedSourcePaths: readonly string[];
}): Promise<CollectionServerBuildArtifact> {
	const { appConfig, collectionName, sourceFilePath, ownedSourcePaths } = input;
	const outdir = path.join(resolveInternalExecutionDir(appConfig), '.server-collections', collectionName);
	const buildRequest = createServerBuildRequest(appConfig, {
		entrypoints: [sourceFilePath],
		outdir,
		naming: '[name].[ext]',
		splitting: false,
		externalPackages: true,
	});
	const runtime = requireAppRuntime(appConfig);
	const invalidationVersion = runtime.moduleLoader.getDevelopmentGeneration();
	const buildIdentity = createCollectionBuildIdentity(
		createBuildRequestIdentity(buildRequest),
		sourceFilePath,
		ownedSourcePaths,
	);
	const artifacts = runtime.collectionArtifacts;
	const existing = artifacts.get(collectionName);
	if (existing?.buildIdentity === buildIdentity && existing?.invalidationVersion === invalidationVersion) {
		return existing;
	}

	const outputFileName = `${collectionName}-${buildIdentity}-${invalidationVersion}.mjs`;
	const buildOptions = { ...buildRequest, naming: outputFileName.replace(/\.mjs$/u, '.[ext]') };

	recordCollectionBuild();
	const buildResult = await buildOrThrow(
		appConfig,
		buildOptions,
		`Error building collection server module ${collectionName}`,
		'nested',
	);

	const compiledOutput = getBuildEntryOutput(buildResult, sourceFilePath, appConfig.rootDir);

	if (!compiledOutput) {
		throw new Error(`No compiled output generated for collection server module: ${sourceFilePath}`);
	}

	const artifact: CollectionServerBuildArtifact = {
		collectionName,
		outputPath: compiledOutput,
		outputUrl: pathToFileURL(compiledOutput).href,
		sourcePaths: [...ownedSourcePaths, sourceFilePath],
		buildIdentity,
		invalidationVersion,
	};
	artifacts.set(collectionName, artifact);
	return artifact;
}
