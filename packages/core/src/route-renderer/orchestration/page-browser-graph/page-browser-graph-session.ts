import path from 'node:path';
import type { GroupedGraphScope } from './route-instance-key.ts';
import { serializeGroupedGraphCacheKey } from './route-instance-key.ts';
import { createHash } from 'node:crypto';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { PageBrowserGraphContribution, PageBrowserGraphResult } from '../../../types/public-types.ts';
import type {
	AssetDefinition,
	ProcessedAsset,
} from '../../../services/assets/asset-processing-service/assets.types.ts';
import { appLogger } from '../../../global/app-logger.ts';

export type GraphPolicy = 'development' | 'production';

export type GraphKey = {
	integrationName: string;
	routeFile: string;
	dependencyInstanceKey: string;
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
	/**
	 * @remarks
	 * When false, the build result is returned to callers but not committed to the session cache.
	 */
	cacheable?: boolean;
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
	dependencyInstanceKey: string;
	policy: GraphPolicy;
	entryFingerprint: string;
};

function serializeGraphKey(key: GraphKey): string {
	return JSON.stringify([
		'graph',
		key.policy,
		key.integrationName,
		key.routeFile,
		key.dependencyInstanceKey,
		key.entryFingerprint,
	]);
}

function normalizeDependencyPath(filePath: string): string {
	return path.resolve(filePath);
}

function parseSerializedGraphKey(serializedKey: string): AffectedGraphIdentity | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(serializedKey);
	} catch {
		return undefined;
	}
	if (
		!Array.isArray(parsed) ||
		parsed.length !== 6 ||
		parsed[0] !== 'graph' ||
		typeof parsed[1] !== 'string' ||
		typeof parsed[2] !== 'string' ||
		typeof parsed[3] !== 'string' ||
		typeof parsed[4] !== 'string' ||
		typeof parsed[5] !== 'string'
	) {
		return undefined;
	}

	const [, policy, integrationName, routeFile, dependencyInstanceKey, entryFingerprint] = parsed;

	if (policy !== 'development' && policy !== 'production') {
		return undefined;
	}

	return {
		policy,
		integrationName,
		routeFile,
		dependencyInstanceKey,
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

	bindGroupedRecord(cacheKey: string, record: GroupedGraphRecord): void {
		for (const dependencyPath of record.dependencyPaths) {
			this.addDependencyBinding(normalizeDependencyPath(dependencyPath), cacheKey);
		}
	}

	unbindGroupedRecord(cacheKey: string, record: GroupedGraphRecord): void {
		for (const dependencyPath of record.dependencyPaths) {
			this.removeDependencyBinding(normalizeDependencyPath(dependencyPath), cacheKey);
		}
	}

	bindPaths(serializedKey: string, dependencyPaths: ReadonlySet<string>): void {
		for (const dependencyPath of dependencyPaths) {
			this.addDependencyBinding(normalizeDependencyPath(dependencyPath), serializedKey);
		}
	}

	unbindPaths(serializedKey: string, dependencyPaths: ReadonlySet<string>): void {
		for (const dependencyPath of dependencyPaths) {
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
	private readonly inFlightDependencyPaths = new Map<string, ReadonlySet<string>>();
	private readonly inFlightGenerations = new Map<string, number>();
	private readonly groupedRecords = new Map<string, GroupedGraphRecord>();
	private readonly groupedInFlight = new Map<string, Promise<Map<string, ProcessedAsset[]>>>();
	private readonly dependencyIndex = new GraphDependencyIndex();
	private readonly graphGenerations = new Map<string, number>();
	private readonly groupedGenerations = new Map<string, number>();
	private buildCount = 0;

	/**
	 * Page Browser Graph compilations in this dev-server session.
	 */
	getBuildCount(): number {
		return this.buildCount;
	}

	getGraphByRoute(
		integrationName: string,
		routeFile: string,
		policy: GraphPolicy,
		dependencyInstanceKey = '',
	): PageBrowserGraphResult | undefined {
		const normalizedRoute = normalizeDependencyPath(routeFile);
		for (const record of this.records.values()) {
			if (
				record.key.integrationName === integrationName &&
				record.key.policy === policy &&
				normalizeDependencyPath(record.key.routeFile) === normalizedRoute &&
				record.key.dependencyInstanceKey === dependencyInstanceKey
			) {
				return record.result;
			}
		}

		return undefined;
	}

	getDependencyPathsByRoute(
		integrationName: string,
		routeFile: string,
		policy: GraphPolicy,
		dependencyInstanceKey = '',
	): ReadonlySet<string> | undefined {
		const normalizedRoute = normalizeDependencyPath(routeFile);
		for (const record of this.records.values()) {
			if (
				record.key.integrationName === integrationName &&
				record.key.policy === policy &&
				normalizeDependencyPath(record.key.routeFile) === normalizedRoute &&
				record.key.dependencyInstanceKey === dependencyInstanceKey
			) {
				return record.dependencyPaths;
			}
		}

		return undefined;
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
		provisionalDependencyPaths: ReadonlySet<string>,
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
		this.inFlightDependencyPaths.set(serializedKey, provisionalDependencyPaths);
		this.inFlightGenerations.set(serializedKey, buildGeneration);
		this.bindDependencyPaths(serializedKey, provisionalDependencyPaths);
		const buildPromise = this.runGraphBuild(serializedKey, key, buildGeneration, build);
		this.inFlight.set(serializedKey, buildPromise);
		return buildPromise;
	}

	resolveGroupedGraph(
		scope: GroupedGraphScope,
		build: () => Promise<GroupedGraphBuildOutcome | undefined>,
	): Promise<Map<string, ProcessedAsset[]>> {
		const cacheKey = serializeGroupedGraphCacheKey(scope);
		const cached = this.groupedRecords.get(cacheKey);
		if (cached) {
			return Promise.resolve(cached.assetsByRoute);
		}

		const pending = this.groupedInFlight.get(cacheKey);
		if (pending) {
			return pending;
		}

		const buildGeneration = this.bumpGroupedGeneration(cacheKey);
		const buildPromise = this.runGroupedBuild(cacheKey, buildGeneration, build);
		this.groupedInFlight.set(cacheKey, buildPromise);
		return buildPromise;
	}

	peekGroupedGraph(scope: GroupedGraphScope): Map<string, ProcessedAsset[]> | undefined {
		return this.groupedRecords.get(serializeGroupedGraphCacheKey(scope))?.assetsByRoute;
	}

	invalidateByFilePath(filePath: string): number {
		const normalizedFilePath = normalizeDependencyPath(filePath);
		const affectedKeys = this.dependencyIndex.getAffectedKeys(normalizedFilePath);
		let invalidated = 0;

		for (const serializedKey of affectedKeys) {
			if (this.groupedRecords.has(serializedKey) || this.groupedInFlight.has(serializedKey)) {
				invalidated += this.invalidateGroupedRecord(serializedKey);
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

			invalidated += this.invalidateSerializedGraphKey(serializedKey);
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
		this.inFlightDependencyPaths.clear();
		this.inFlightGenerations.clear();
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
			const inFlightDependencyPaths = this.inFlightDependencyPaths.get(serializedKey);
			if (inFlightDependencyPaths) {
				this.unbindDependencyPaths(serializedKey, inFlightDependencyPaths);
				this.inFlightDependencyPaths.delete(serializedKey);
			}
			this.inFlightGenerations.delete(serializedKey);
			this.graphGenerations.delete(serializedKey);
		}

		if (policy === 'production') {
			for (const cacheKey of [...this.groupedRecords.keys()]) {
				const groupedRecord = this.groupedRecords.get(cacheKey);
				if (groupedRecord) {
					this.dependencyIndex.unbindGroupedRecord(cacheKey, groupedRecord);
				}
				this.groupedRecords.delete(cacheKey);
				this.groupedInFlight.delete(cacheKey);
				this.groupedGenerations.delete(cacheKey);
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

			if (record.key.dependencyInstanceKey !== key.dependencyInstanceKey) {
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

	private bumpGroupedGeneration(cacheKey: string): number {
		const next = (this.groupedGenerations.get(cacheKey) ?? 0) + 1;
		this.groupedGenerations.set(cacheKey, next);
		return next;
	}

	private invalidateSerializedGraphKey(serializedKey: string): number {
		const record = this.records.get(serializedKey);
		if (record) {
			this.dependencyIndex.unbindRecord(record);
			this.records.delete(serializedKey);
		}

		const inFlightDependencyPaths = this.inFlightDependencyPaths.get(serializedKey);
		if (inFlightDependencyPaths) {
			this.unbindDependencyPaths(serializedKey, inFlightDependencyPaths);
			this.inFlightDependencyPaths.delete(serializedKey);
		}

		const hadInFlightBuild = this.inFlight.delete(serializedKey);
		this.inFlightGenerations.delete(serializedKey);
		this.bumpGraphGeneration(serializedKey);
		return record || hadInFlightBuild ? 1 : 0;
	}

	private invalidateGroupedRecord(cacheKey: string): number {
		const groupedRecord = this.groupedRecords.get(cacheKey);
		if (groupedRecord) {
			this.dependencyIndex.unbindGroupedRecord(cacheKey, groupedRecord);
			this.groupedRecords.delete(cacheKey);
		}

		this.bumpGroupedGeneration(cacheKey);
		this.groupedInFlight.delete(cacheKey);
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

			if (buildResult.cacheable === false) {
				this.releaseInFlightDependencyPaths(serializedKey, buildGeneration);
				return buildResult.result;
			}

			this.releaseInFlightDependencyPaths(serializedKey, buildGeneration);
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
			this.clearInFlightBuild(serializedKey, buildGeneration);
		}
	}

	private async runGroupedBuild(
		cacheKey: string,
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

			if (!this.canCommitGroupedBuild(cacheKey, buildGeneration)) {
				const existing = this.groupedRecords.get(cacheKey);
				return existing?.assetsByRoute ?? new Map();
			}

			const previous = this.groupedRecords.get(cacheKey);
			if (previous) {
				this.dependencyIndex.unbindGroupedRecord(cacheKey, previous);
			}

			const record: GroupedGraphRecord = {
				assetsByRoute: buildResult.assetsByRoute,
				dependencyPaths: buildResult.dependencyPaths,
				generation: buildGeneration,
			};
			this.groupedRecords.set(cacheKey, record);
			this.dependencyIndex.bindGroupedRecord(cacheKey, record);
			return record.assetsByRoute;
		} catch (error) {
			return Promise.reject(error);
		} finally {
			this.groupedInFlight.delete(cacheKey);
		}
	}

	private canCommitGraphBuild(serializedKey: string, buildGeneration: number): boolean {
		return this.graphGenerations.get(serializedKey) === buildGeneration;
	}

	private canCommitGroupedBuild(cacheKey: string, buildGeneration: number): boolean {
		return this.groupedGenerations.get(cacheKey) === buildGeneration;
	}

	private bindDependencyPaths(serializedKey: string, dependencyPaths: ReadonlySet<string>): void {
		this.dependencyIndex.bindPaths(serializedKey, dependencyPaths);
	}

	private unbindDependencyPaths(serializedKey: string, dependencyPaths: ReadonlySet<string>): void {
		this.dependencyIndex.unbindPaths(serializedKey, dependencyPaths);
	}

	private clearInFlightBuild(serializedKey: string, buildGeneration: number): void {
		if (this.inFlightGenerations.get(serializedKey) !== buildGeneration) {
			return;
		}

		this.releaseInFlightDependencyPaths(serializedKey, buildGeneration);
		this.inFlight.delete(serializedKey);
		this.inFlightGenerations.delete(serializedKey);
	}

	private releaseInFlightDependencyPaths(serializedKey: string, buildGeneration: number): void {
		if (this.inFlightGenerations.get(serializedKey) !== buildGeneration) {
			return;
		}

		const dependencyPaths = this.inFlightDependencyPaths.get(serializedKey);
		if (!dependencyPaths) {
			return;
		}

		this.unbindDependencyPaths(serializedKey, dependencyPaths);
		this.inFlightDependencyPaths.delete(serializedKey);
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

	for (const watchPath of contribution.watchPaths ?? []) {
		dependencyPaths.add(normalizeDependencyPath(watchPath));
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
