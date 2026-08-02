import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type BuildResult } from '../../build/build-adapter.ts';
import { createBuildRequestIdentity } from '../../build/runtime/build-request-identity.ts';
import { createServerBuildRequest } from '../../build/runtime/build-request-policy.ts';
import { recordCollectionBuild } from '../../diagnostics/request-pipeline-metrics.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { resolveInternalExecutionDir } from '../../utils/resolve-work-dir.ts';
import { fileSystem } from '@ecopages/file-system';

export type CollectionServerBuildArtifact = {
	collectionName: string;
	outputPath: string;
	outputUrl: string;
	sourcePaths: string[];
	buildIdentity: string;
};

const artifactsByCollection = new WeakMap<EcoPagesAppConfig, Map<string, CollectionServerBuildArtifact>>();

function getArtifactMap(appConfig: EcoPagesAppConfig): Map<string, CollectionServerBuildArtifact> {
	let artifacts = artifactsByCollection.get(appConfig);
	if (!artifacts) {
		artifacts = new Map();
		artifactsByCollection.set(appConfig, artifacts);
	}
	return artifacts;
}

export function getCollectionServerBuildArtifact(
	appConfig: EcoPagesAppConfig,
	collectionName: string,
): CollectionServerBuildArtifact | undefined {
	return getArtifactMap(appConfig).get(collectionName);
}

export function clearCollectionServerBuildArtifacts(appConfig: EcoPagesAppConfig): void {
	getArtifactMap(appConfig).clear();
}

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
		profile: 'route-module',
		entrypoints: [sourceFilePath],
		outdir,
		naming: '[name].[ext]',
		splitting: false,
		externalPackages: true,
	});
	const buildIdentity = createCollectionBuildIdentity(
		createBuildRequestIdentity(buildRequest),
		sourceFilePath,
		ownedSourcePaths,
	);
	const artifacts = getArtifactMap(appConfig);
	const existing = artifacts.get(collectionName);
	if (existing?.buildIdentity === buildIdentity) {
		return existing;
	}

	const outputFileName = `${collectionName}-${buildIdentity}.mjs`;
	const buildOptions = { ...buildRequest, naming: outputFileName.replace(/\.mjs$/u, '.[ext]') };

	recordCollectionBuild();
	const buildResult: BuildResult = await build(buildOptions);
	if (!buildResult.success) {
		const details = buildResult.logs.map((log) => log.message).join(' | ');
		throw new Error(`Error building collection server module ${collectionName}: ${details}`);
	}

	const preferredOutputPath = path.join(outdir, outputFileName);
	const compiledOutput =
		buildResult.outputs.find((output) => output.path === preferredOutputPath)?.path ??
		buildResult.outputs.find((output) => /\.(?:[cm]?js)$/u.test(output.path))?.path;

	if (!compiledOutput) {
		throw new Error(`No compiled output generated for collection server module: ${sourceFilePath}`);
	}

	const artifact: CollectionServerBuildArtifact = {
		collectionName,
		outputPath: compiledOutput,
		outputUrl: pathToFileURL(compiledOutput).href,
		sourcePaths: [...ownedSourcePaths, sourceFilePath],
		buildIdentity,
	};
	artifacts.set(collectionName, artifact);
	return artifact;
}
