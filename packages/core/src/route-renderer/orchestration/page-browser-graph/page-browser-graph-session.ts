import path from 'node:path';
import { createHash } from 'node:crypto';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { PageBrowserGraphContribution, PageBrowserGraphResult } from '../../../types/public-types.ts';
import type { AssetDefinition, ProcessedAsset } from '../../../services/assets/asset-processing-service/assets.types.ts';
import { appLogger } from '../../../global/app-logger.ts';

export type GraphPolicy = 'development' | 'production';

export type GraphKey = {
	integrationName: string;
	routeFile: string;
	entryFingerprint: string;
	policy: GraphPolicy;
};

export type GraphRecord = {
	key: GraphKey;
	result: PageBrowserGraphResult;
	dependencyPaths: ReadonlySet<string>;
	committedAt: number;
	generation: number;
};

export type GraphBuildResult = {
	result: PageBrowserGraphResult;
	dependencyPaths: ReadonlySet<string>;
};

type GroupedGraphRecord = {
	assetsByRoute: Map<string, ProcessedAsset[]>;
	dependencyPaths: ReadonlySet<string>;
	generation: number;
};

export type GroupedGraphBuildOutcome =
	| GroupedGraphRecord
	| {
			skipCache: true;
			assetsByRoute: Map<string, ProcessedAsset[]>;
			dependencyPaths: ReadonlySet<string>;
	  };

function isSkipCacheGroupedOutcome(
	outcome: GroupedGraphBuildOutcome,
): outcome is Extract<GroupedGraphBuildOutcome, { skipCache: true }> {
	return 'skipCache' in outcome;
}

export type AffectedGraphIdentity = {
	integrationName: string;
	routeFile: string;
	policy: GraphPolicy;
	entryFingerprint: string;
};

function serializeGraphKey(key: GraphKey): string {
	return `${key.policy}::${key.integrationName}::${key.routeFile}::${key.entryFingerprint}`;
}

function normalizeDependencyPath(filePath: string): string {
	return path.resolve(filePath);
}

function parseSerializedGraphKey(serializedKey: string): AffectedGraphIdentity | undefined {
	if (serializedKey.startsWith('grouped::')) {
		return undefined;
	}

	const [policy, integrationName, routeFile, entryFingerprint] = serializedKey.split('::');
	if (!policy || !integrationName || !routeFile || entryFingerprint === undefined) {
		return undefined;
	}

	if (policy !== 'development' && policy !== 'production') {
		return undefined;
	}

	return {
		policy,
		integrationName,
		routeFile,
		entryFingerprint,
	};
}

/**
 * Reverse index from dependency paths to graph cache keys.
 */
export class GraphDependencyIndex {
	private readonly dependencyToGraphKeys = new Map<string, Set<string>>();

	bindRecord(record: GraphRecord): void {
		const serializedKey = serializeGraphKey(record.key);
		for (const dependencyPath of record.dependencyPaths) {
			this.addDependencyBinding(normalizeDependencyPath(dependencyPath), serializedKey);
		}
	}

	unbindRecord(record: GraphRecord): void {
		const serializedKey = serializeGraphKey(record.key);
		for (const dependencyPath of record.dependencyPaths) {
			this.removeDependencyBinding(normalizeDependencyPath(dependencyPath), serializedKey);
		}
	}

	bindGroupedRecord(integrationName: string, record: GroupedGraphRecord): void {
		const serializedKey = `grouped::${integrationName}`;
		for (const dependencyPath of record.dependencyPaths) {
			this.addDependencyBinding(normalizeDependencyPath(dependencyPath), serializedKey);
		}
	}

	unbindGroupedRecord(integrationName: string, record: GroupedGraphRecord): void {
		const serializedKey = `grouped::${integrationName}`;
		for (const dependencyPath of record.dependencyPaths) {
			this.removeDependencyBinding(normalizeDependencyPath(dependencyPath), serializedKey);
		}
	}

	getAffectedKeys(filePath: string): Set<string> {
		return new Set(this.dependencyToGraphKeys.get(normalizeDependencyPath(filePath)) ?? []);
	}

	resetForTests(): void {
		this.dependencyToGraphKeys.clear();
	}

	private addDependencyBinding(dependencyPath: string, serializedKey: string): void {
		const graphKeys = this.dependencyToGraphKeys.get(dependencyPath) ?? new Set<string>();
		graphKeys.add(serializedKey);
		this.dependencyToGraphKeys.set(dependencyPath, graphKeys);
	}

	private removeDependencyBinding(dependencyPath: string, serializedKey: string): void {
		const graphKeys = this.dependencyToGraphKeys.get(dependencyPath);
		if (!graphKeys) {
			return;
		}

		graphKeys.delete(serializedKey);
		if (graphKeys.size === 0) {
			this.dependencyToGraphKeys.delete(dependencyPath);
		}
	}
}

/**
 * Session-local Page Browser Graph cache with precise dependency invalidation.
 */
export class SessionPageBrowserGraphCache {
	private readonly records = new Map<string, GraphRecord>();
	private readonly inFlight = new Map<string, Promise<PageBrowserGraphResult | undefined>>();
	private readonly groupedRecords = new Map<string, GroupedGraphRecord>();
	private readonly groupedInFlight = new Map<string, Promise<Map<string, ProcessedAsset[]>>>();
	private readonly dependencyIndex = new GraphDependencyIndex();
	private readonly graphGenerations = new Map<string, number>();
	private readonly groupedGenerations = new Map<string, number>();
	private buildCount = 0;

	getGraphByRoute(
		integrationName: string,
		routeFile: string,
		policy: GraphPolicy,
	): PageBrowserGraphResult | undefined {
		const normalizedRoute = normalizeDependencyPath(routeFile);
		for (const record of this.records.values()) {
			if (record.key.integrationName !== integrationName) {
				continue;
			}

			if (record.key.policy !== policy) {
				continue;
			}

			if (normalizeDependencyPath(record.key.routeFile) !== normalizedRoute) {
				continue;
			}

			return record.result;
		}

		return undefined;
	}

	getBuildCount(): number {
		return this.buildCount;
	}

	getAffectedGraphIdentities(filePath: string): AffectedGraphIdentity[] {
		const identities: AffectedGraphIdentity[] = [];
		for (const serializedKey of this.dependencyIndex.getAffectedKeys(filePath)) {
			const identity = parseSerializedGraphKey(serializedKey);
			if (identity) {
				identities.push(identity);
			}
		}
		return identities;
	}

	resolveGraph(
		key: GraphKey,
		build: () => Promise<GraphBuildResult | undefined>,
	): Promise<PageBrowserGraphResult | undefined> {
		const serializedKey = serializeGraphKey(key);

		const cached = this.records.get(serializedKey);
		if (cached) {
			return Promise.resolve(cached.result);
		}

		const pending = this.inFlight.get(serializedKey);
		if (pending) {
			return pending;
		}

		const buildGeneration = this.bumpGraphGeneration(serializedKey);
		const buildPromise = this.runGraphBuild(serializedKey, key, buildGeneration, build);
		this.inFlight.set(serializedKey, buildPromise);
		return buildPromise;
	}

	resolveGroupedGraph(
		integrationName: string,
		build: () => Promise<GroupedGraphBuildOutcome | undefined>,
	): Promise<Map<string, ProcessedAsset[]>> {
		const cached = this.groupedRecords.get(integrationName);
		if (cached) {
			return Promise.resolve(cached.assetsByRoute);
		}

		const pending = this.groupedInFlight.get(integrationName);
		if (pending) {
			return pending;
		}

		const buildGeneration = this.bumpGroupedGeneration(integrationName);
		const buildPromise = this.runGroupedBuild(integrationName, buildGeneration, build);
		this.groupedInFlight.set(integrationName, buildPromise);
		return buildPromise;
	}

	peekGroupedGraph(integrationName: string): Map<string, ProcessedAsset[]> | undefined {
		return this.groupedRecords.get(integrationName)?.assetsByRoute;
	}

	invalidateByFilePath(filePath: string): number {
		const normalizedFilePath = normalizeDependencyPath(filePath);
		const affectedKeys = this.dependencyIndex.getAffectedKeys(normalizedFilePath);
		let invalidated = 0;

		for (const serializedKey of affectedKeys) {
			if (serializedKey.startsWith('grouped::')) {
				const integrationName = serializedKey.slice('grouped::'.length);
				invalidated += this.invalidateGroupedRecord(integrationName);
				continue;
			}

			invalidated += this.invalidateSerializedGraphKey(serializedKey);
		}

		for (const serializedKey of this.inFlight.keys()) {
			const identity = parseSerializedGraphKey(serializedKey);
			if (!identity) {
				continue;
			}

			if (normalizeDependencyPath(identity.routeFile) !== normalizedFilePath) {
				continue;
			}

			if (affectedKeys.has(serializedKey)) {
				continue;
			}

			this.bumpGraphGeneration(serializedKey);
			this.inFlight.delete(serializedKey);
			invalidated += 1;
		}

		if (invalidated > 0) {
			appLogger.debug(
				`[PageBrowserGraphSession] invalidated ${invalidated} graph record(s) for ${normalizedFilePath}`,
			);
		}

		return invalidated;
	}

	invalidateRoute(integrationName: string, routeFile: string): void {
		const normalizedRoute = normalizeDependencyPath(routeFile);
		for (const [serializedKey, record] of this.records) {
			if (record.key.integrationName !== integrationName) {
				continue;
			}

			if (normalizeDependencyPath(record.key.routeFile) !== normalizedRoute) {
				continue;
			}

			this.invalidateSerializedGraphKey(serializedKey);
		}
	}

	invalidateByRouteFile(routeFile: string): void {
		const normalizedRoute = normalizeDependencyPath(routeFile);
		for (const [serializedKey, record] of this.records) {
			if (normalizeDependencyPath(record.key.routeFile) !== normalizedRoute) {
				continue;
			}

			this.invalidateSerializedGraphKey(serializedKey);
		}
	}

	resetForTests(): void {
		this.records.clear();
		this.inFlight.clear();
		this.groupedRecords.clear();
		this.groupedInFlight.clear();
		this.graphGenerations.clear();
		this.groupedGenerations.clear();
		this.dependencyIndex.resetForTests();
		this.buildCount = 0;
	}

	exportRecords(policy: GraphPolicy): GraphRecord[] {
		return [...this.records.values()].filter((record) => record.key.policy === policy);
	}

	clearPolicyRecords(policy: GraphPolicy): void {
		for (const [serializedKey, record] of this.records) {
			if (record.key.policy !== policy) {
				continue;
			}

			this.dependencyIndex.unbindRecord(record);
			this.records.delete(serializedKey);
			this.inFlight.delete(serializedKey);
			this.graphGenerations.delete(serializedKey);
		}

		if (policy === 'production') {
			for (const integrationName of [...this.groupedRecords.keys()]) {
				const groupedRecord = this.groupedRecords.get(integrationName);
				if (groupedRecord) {
					this.dependencyIndex.unbindGroupedRecord(integrationName, groupedRecord);
				}
				this.groupedRecords.delete(integrationName);
				this.groupedInFlight.delete(integrationName);
				this.groupedGenerations.delete(integrationName);
			}
		}
	}

	private pruneStaleRouteRecords(key: GraphKey): void {
		const normalizedRoute = normalizeDependencyPath(key.routeFile);
		for (const [serializedKey, record] of this.records) {
			if (record.key.integrationName !== key.integrationName) {
				continue;
			}

			if (normalizeDependencyPath(record.key.routeFile) !== normalizedRoute) {
				continue;
			}

			if (record.key.entryFingerprint === key.entryFingerprint && record.key.policy === key.policy) {
				continue;
			}

			this.invalidateSerializedGraphKey(serializedKey);
		}
	}

	private bumpGraphGeneration(serializedKey: string): number {
		const next = (this.graphGenerations.get(serializedKey) ?? 0) + 1;
		this.graphGenerations.set(serializedKey, next);
		return next;
	}

	private bumpGroupedGeneration(integrationName: string): number {
		const next = (this.groupedGenerations.get(integrationName) ?? 0) + 1;
		this.groupedGenerations.set(integrationName, next);
		return next;
	}

	private invalidateSerializedGraphKey(serializedKey: string): number {
		const record = this.records.get(serializedKey);
		if (record) {
			this.dependencyIndex.unbindRecord(record);
			this.records.delete(serializedKey);
		}

		this.bumpGraphGeneration(serializedKey);
		this.inFlight.delete(serializedKey);
		return record ? 1 : 0;
	}

	private invalidateGroupedRecord(integrationName: string): number {
		const groupedRecord = this.groupedRecords.get(integrationName);
		if (groupedRecord) {
			this.dependencyIndex.unbindGroupedRecord(integrationName, groupedRecord);
			this.groupedRecords.delete(integrationName);
		}

		this.bumpGroupedGeneration(integrationName);
		this.groupedInFlight.delete(integrationName);
		return groupedRecord ? 1 : 0;
	}

	private async runGraphBuild(
		serializedKey: string,
		key: GraphKey,
		buildGeneration: number,
		build: () => Promise<GraphBuildResult | undefined>,
	): Promise<PageBrowserGraphResult | undefined> {
		try {
			this.buildCount += 1;
			const buildResult = await build();
			if (!buildResult) {
				return undefined;
			}

			if (!this.canCommitGraphBuild(serializedKey, buildGeneration)) {
				const existing = this.records.get(serializedKey);
				return existing?.result;
			}

			this.pruneStaleRouteRecords(key);

			const previous = this.records.get(serializedKey);
			if (previous) {
				this.dependencyIndex.unbindRecord(previous);
			}

			const record: GraphRecord = {
				key,
				result: buildResult.result,
				dependencyPaths: buildResult.dependencyPaths,
				committedAt: Date.now(),
				generation: buildGeneration,
			};
			this.records.set(serializedKey, record);
			this.dependencyIndex.bindRecord(record);
			return record.result;
		} catch (error) {
			return Promise.reject(error);
		} finally {
			this.inFlight.delete(serializedKey);
		}
	}

	private async runGroupedBuild(
		integrationName: string,
		buildGeneration: number,
		build: () => Promise<GroupedGraphBuildOutcome | undefined>,
	): Promise<Map<string, ProcessedAsset[]>> {
		try {
			this.buildCount += 1;
			const buildResult = await build();
			if (!buildResult) {
				return new Map();
			}

			if (isSkipCacheGroupedOutcome(buildResult)) {
				return buildResult.assetsByRoute;
			}

			if (!this.canCommitGroupedBuild(integrationName, buildGeneration)) {
				const existing = this.groupedRecords.get(integrationName);
				return existing?.assetsByRoute ?? new Map();
			}

			const previous = this.groupedRecords.get(integrationName);
			if (previous) {
				this.dependencyIndex.unbindGroupedRecord(integrationName, previous);
			}

			const record: GroupedGraphRecord = {
				assetsByRoute: buildResult.assetsByRoute,
				dependencyPaths: buildResult.dependencyPaths,
				generation: buildGeneration,
			};
			this.groupedRecords.set(integrationName, record);
			this.dependencyIndex.bindGroupedRecord(integrationName, record);
			return record.assetsByRoute;
		} catch (error) {
			return Promise.reject(error);
		} finally {
			this.groupedInFlight.delete(integrationName);
		}
	}

	private canCommitGraphBuild(serializedKey: string, buildGeneration: number): boolean {
		return this.graphGenerations.get(serializedKey) === buildGeneration;
	}

	private canCommitGroupedBuild(integrationName: string, buildGeneration: number): boolean {
		return this.groupedGenerations.get(integrationName) === buildGeneration;
	}
}

const sessionByAppConfig = new WeakMap<EcoPagesAppConfig, SessionPageBrowserGraphCache>();

/**
 * Returns the session graph cache for one app instance.
 */
export function getAppPageBrowserGraphSession(appConfig: EcoPagesAppConfig): SessionPageBrowserGraphCache {
	const existing = appConfig.runtime?.pageBrowserGraphSession;
	if (existing) {
		return existing;
	}

	const cached = sessionByAppConfig.get(appConfig);
	if (cached) {
		return cached;
	}

	const session = new SessionPageBrowserGraphCache();
	sessionByAppConfig.set(appConfig, session);
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		pageBrowserGraphSession: session,
	};
	return session;
}

/**
 * Invalidates graph records that depend on the changed file path.
 */
export function invalidatePageBrowserGraphSession(appConfig: EcoPagesAppConfig, filePath: string): number {
	return getAppPageBrowserGraphSession(appConfig).invalidateByFilePath(filePath);
}

/**
 * Returns graph identities affected by a source file change.
 */
export function getAffectedPageBrowserGraphIdentities(
	appConfig: EcoPagesAppConfig,
	filePath: string,
): AffectedGraphIdentity[] {
	return getAppPageBrowserGraphSession(appConfig).getAffectedGraphIdentities(filePath);
}

/**
 * Builds a stable fingerprint from declared browser-entry dependencies and assets.
 */
export function createPageBrowserGraphEntryFingerprint(contribution: PageBrowserGraphContribution): string {
	const descriptors = [
		...(contribution.dependencies ?? []).map((dependency) => describeAssetDependency(dependency)),
		...(contribution.assets ?? []).map((asset) => describeProcessedAsset(asset)),
	].sort((left, right) => left.localeCompare(right));

	return descriptors.join('|') || 'empty';
}

/**
 * Collects dependency paths used for graph invalidation.
 */
export function collectPageBrowserGraphDependencyPaths(
	routeFile: string,
	contribution: PageBrowserGraphContribution,
	processedAssets: ProcessedAsset[],
): ReadonlySet<string> {
	const dependencyPaths = new Set<string>([normalizeDependencyPath(routeFile)]);

	for (const dependency of contribution.dependencies ?? []) {
		if (dependency.source === 'file') {
			dependencyPaths.add(normalizeDependencyPath(dependency.filepath));
		}
	}

	for (const asset of processedAssets) {
		if (asset.sourceFilepath) {
			dependencyPaths.add(normalizeDependencyPath(asset.sourceFilepath));
		}

		for (const bundledSourceFilepath of asset.bundledSourceFilepaths ?? []) {
			dependencyPaths.add(normalizeDependencyPath(bundledSourceFilepath));
		}
	}

	return dependencyPaths;
}

function describeProcessedAsset(asset: ProcessedAsset): string {
	const filepath = asset.filepath ?? '';
	const sourceFilepath = asset.sourceFilepath ?? '';
	const content = typeof asset.content === 'string' ? asset.content : '';
	const contentDigest = content ? createHash('sha1').update(content).digest('hex').slice(0, 12) : '';
	return `asset:${asset.kind}:${filepath}:${sourceFilepath}:${contentDigest}`;
}

function describeAssetDependency(dependency: AssetDefinition): string {
	switch (dependency.source) {
		case 'file':
			return `file:${dependency.filepath}`;
		case 'node-module':
			return `module:${dependency.importPath}`;
		case 'content': {
			const content = typeof dependency.content === 'string' ? dependency.content : '';
			const contentDigest = createHash('sha1').update(content).digest('hex').slice(0, 12);
			const name = 'name' in dependency && typeof dependency.name === 'string' ? dependency.name : '';
			return `content:${dependency.kind}:${name}:${contentDigest}`;
		}
		default: {
			const exhaustive: never = dependency;
			return String(exhaustive);
		}
	}
}
