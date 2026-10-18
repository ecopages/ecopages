import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import { buildServerModule } from '@ecopages/core/build';
import { requireAppRuntime } from '@ecopages/core/integration';
import { recordCollectionBuild } from '@ecopages/core/build';
import type { ProcessorContext } from '@ecopages/core/processor';

export type CollectionServerBuildArtifact = {
	collectionName: string;
	outputPath: string;
	outputUrl: string;
	sourcePaths: string[];
	buildIdentity: string;
	invalidationVersion: number;
};

type CollectionServerArtifacts = Map<string, CollectionServerBuildArtifact>;

function createCollectionBuildIdentity(sourceFilePath: string, ownedSourcePaths: readonly string[]): string {
	const sourcePaths = [
		...new Set([sourceFilePath, ...ownedSourcePaths].map((sourcePath) => path.resolve(sourcePath))),
	].sort();
	const sourceIdentity = sourcePaths
		.map(
			(sourcePath) => `${sourcePath}\0${fileSystem.exists(sourcePath) ? fileSystem.hash(sourcePath) : 'missing'}`,
		)
		.join('\0');

	return createHash('sha256')
		.update('collection-server-build-v3\0')
		.update(sourceIdentity)
		.digest('hex')
		.slice(0, 16);
}

/** Builds one generated collection server module as an independent server unit. */
export async function buildCollectionServerModule(input: {
	appConfig: ProcessorContext['config'];
	artifacts: CollectionServerArtifacts;
	collectionName: string;
	sourceFilePath: string;
	ownedSourcePaths: readonly string[];
}): Promise<CollectionServerBuildArtifact> {
	const { appConfig, artifacts, collectionName, sourceFilePath, ownedSourcePaths } = input;
	const runtime = requireAppRuntime(appConfig);
	const invalidationVersion = runtime.moduleLoader.getDevelopmentGeneration();
	const buildIdentity = createCollectionBuildIdentity(sourceFilePath, ownedSourcePaths);
	const existing = artifacts.get(collectionName);
	if (existing?.buildIdentity === buildIdentity && existing.invalidationVersion === invalidationVersion) {
		return existing;
	}

	recordCollectionBuild(runtime.requestPipelineMetrics);
	const outputPath = await buildServerModule(appConfig, {
		entrypoint: sourceFilePath,
		outputDirectory: path.join('.server-collections', collectionName),
		outputFileName: `${collectionName}-${buildIdentity}-${invalidationVersion}.mjs`,
		failureMessage: `Error building collection server module ${collectionName}`,
	});
	const artifact: CollectionServerBuildArtifact = {
		collectionName,
		outputPath,
		outputUrl: pathToFileURL(outputPath).href,
		sourcePaths: [...ownedSourcePaths, sourceFilePath],
		buildIdentity,
		invalidationVersion,
	};

	artifacts.set(collectionName, artifact);
	return artifact;
}
