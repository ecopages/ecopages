import { lstatSync, realpathSync, statSync, watch as watchFs, type FSWatcher, type Stats } from 'node:fs';
import { lstat as lstatAsync, readdir as readdirAsync, stat as statAsync } from 'node:fs/promises';
import path from 'node:path';
import type { FileChange, FileStats, FileWatcher, WatchOptions } from '../types.ts';

type PathScope = 'directory' | 'file' | 'unknown';
type EntryKind = 'directory' | 'file';

type WatchedPath = {
	requestedPath: string;
	requestedRootPath: string;
	canonicalPath: string;
	rootPath: string;
	scope: PathScope;
};

type WatchRoot = {
	path: string;
	recursive: boolean;
	transient?: boolean;
};

type RootReconcileRequest = {
	root: WatchRoot;
	notifyRescan: boolean;
};

type PendingPathChange = {
	timer: ReturnType<typeof setTimeout>;
	forceChange: boolean;
};

const CHANGE_COALESCING_MS = 50;

/**
 * Watches requested filesystem paths with native directory watchers.
 *
 * @remarks
 * Existing entries are indexed before readiness so rename events can distinguish adds, replacements and directory
 * removals. Indexing emits no initial changes.
 */
export class RecursiveFileWatcher implements FileWatcher {
	public readonly ready: Promise<void>;
	private readonly options: WatchOptions;
	private readonly watchedPaths: WatchedPath[] = [];
	private readonly watchers = new Map<FSWatcher, WatchRoot>();
	private readonly knownEntries = new Map<string, EntryKind>();
	private readonly knownStats = new Map<string, Stats>();
	private readonly ignoredDirectories = new Set<string>();
	private readonly pendingChanges = new Map<string, PendingPathChange>();
	private readonly pendingRootReconciles = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly pendingRootReconcileNotifications = new Map<string, boolean>();
	private readonly activeRootReconciles = new Map<string, Promise<void>>();
	private readonly rootsToReconcileAgain = new Map<string, RootReconcileRequest>();
	private readonly rootsToReconcileAfterIndex = new Map<string, RootReconcileRequest>();
	private readonly changesDuringIndex = new Map<string, boolean>();
	private pathUpdates: Promise<void> = Promise.resolve();
	private indexing = false;
	private readyResolve!: () => void;
	private readyReject!: (error: unknown) => void;
	private readySettled = false;
	private closed = false;
	private closePromise: Promise<void> | undefined;

	public constructor(paths: readonly string[], options: WatchOptions) {
		this.options = options;
		this.ready = new Promise<void>((resolve, reject) => {
			this.readyResolve = resolve;
			this.readyReject = reject;
		});
		void this.add(paths).then(
			() => {
				this.readySettled = true;
				this.readyResolve();
			},
			(error: unknown) => {
				this.readySettled = true;
				this.readyReject(error);
				void this.close();
			},
		);
	}

	public add(paths: readonly string[]): Promise<void> {
		const update = this.pathUpdates.then(() => this.addPaths(paths));
		this.pathUpdates = update.catch((error: unknown) => this.handleError(error));
		return update;
	}

	public close(): Promise<void> {
		if (this.closePromise) return this.closePromise;
		this.closed = true;
		this.closePromise = this.closeWatchers();
		return this.closePromise;
	}

	private async closeWatchers(): Promise<void> {
		for (const pending of this.pendingChanges.values()) clearTimeout(pending.timer);
		this.pendingChanges.clear();
		for (const pending of this.pendingRootReconciles.values()) clearTimeout(pending);
		this.pendingRootReconciles.clear();
		this.pendingRootReconcileNotifications.clear();
		this.rootsToReconcileAgain.clear();
		this.rootsToReconcileAfterIndex.clear();
		for (const watcher of this.watchers.keys()) watcher.close();
		this.watchers.clear();
	}

	private async addPaths(paths: readonly string[]): Promise<void> {
		if (this.closed || paths.length === 0) return;
		const requestedPaths = new Set(this.watchedPaths.map(({ requestedPath }) => requestedPath));
		const newPaths = paths
			.map((watchPath) => resolveWatchedPath(watchPath))
			.filter(({ requestedPath }) => {
				if (requestedPaths.has(requestedPath)) return false;
				requestedPaths.add(requestedPath);
				return true;
			});
		if (!newPaths.length) return;

		const existingWatchRoots = new Set([...this.watchers.values()].map(rootKey));
		const nativeWatchRegistrationStartedAt = performance.now();
		this.indexing = true;
		try {
			this.watchedPaths.push(...newPaths);
			for (const watcher of this.getWatchRoots()) this.openWatcher(watcher);
			this.closeUnneededWatchers();
			await this.seedKnownEntries(newPaths);
			if (this.closed) return;
			for (const watcher of this.getWatchRoots()) this.openWatcher(watcher);
			this.closeUnneededWatchers();
			await this.catchUpNewWatchRoots(existingWatchRoots, nativeWatchRegistrationStartedAt);
		} finally {
			this.indexing = false;
			for (const [changePath, forceChange] of this.changesDuringIndex) this.queueChange(changePath, forceChange);
			this.changesDuringIndex.clear();
			for (const { root, notifyRescan } of this.rootsToReconcileAfterIndex.values())
				this.scheduleRootReconcile(root, notifyRescan);
			this.rootsToReconcileAfterIndex.clear();
		}
	}

	/**
	 * @remarks
	 * `fs.watch` does not expose a registration-ready event. Allow newly opened native roots to settle, then reconcile once
	 * so an edit in the registration window is not lost before `ready` or `add()` resolves.
	 */
	private async catchUpNewWatchRoots(
		existingWatchRoots: ReadonlySet<string>,
		registrationStartedAt: number,
	): Promise<void> {
		const newWatchRoots = this.getWatchRoots().filter((root) => !existingWatchRoots.has(rootKey(root)));
		if (!newWatchRoots.length) return;
		const remainingWaitMs = CHANGE_COALESCING_MS - (performance.now() - registrationStartedAt);
		if (remainingWaitMs > 0)
			await new Promise<void>((resolve) => {
				setTimeout(resolve, remainingWaitMs);
			});
		if (this.closed) return;
		for (const root of newWatchRoots) await this.reconcileWatchRoot(root, false);
	}

	private closeUnneededWatchers(): void {
		const desiredRoots = this.getWatchRoots();
		const desiredRootKeys = new Set(desiredRoots.map(rootKey));
		for (const [watcher, root] of this.watchers) {
			const existingKey = rootKey(root);
			const desiredRoot = desiredRoots.find((candidate) => rootKey(candidate) === existingKey);
			if (desiredRoot) {
				this.watchers.set(watcher, desiredRoot);
				continue;
			}
			const coveredByRecursiveRoot = desiredRoots.some(
				(candidate) => candidate.recursive && isSameOrInside(root.path, candidate.path),
			);
			if (!desiredRootKeys.has(existingKey) && root.transient && !coveredByRecursiveRoot) continue;
			watcher.close();
			this.watchers.delete(watcher);
		}
	}

	private getWatchRoots(): WatchRoot[] {
		const recursiveRoots = minimizeRoots(
			this.watchedPaths.filter(({ scope }) => scope === 'directory').map(({ canonicalPath }) => canonicalPath),
		);
		const nonRecursiveCandidates = this.watchedPaths.flatMap((watchedPath) =>
			watchedPath.scope === 'directory' ? [path.dirname(watchedPath.canonicalPath)] : [watchedPath.rootPath],
		);
		const nonRecursiveRoots = [...new Set(nonRecursiveCandidates)].filter(
			(candidate) => !recursiveRoots.some((root) => isSameOrInside(candidate, root)),
		);
		return [
			...nonRecursiveRoots.map((root) => ({
				path: root,
				recursive: false,
				transient: this.watchedPaths.some(({ rootPath, scope }) => scope === 'unknown' && rootPath === root),
			})),
			...recursiveRoots.map((root) => ({ path: root, recursive: true })),
		];
	}

	private openWatcher(root: WatchRoot): void {
		if ([...this.watchers.values()].some((existingRoot) => rootKey(existingRoot) === rootKey(root))) return;
		const watcher = watchFs(root.path, { encoding: 'utf8', recursive: root.recursive }, (eventType, filename) => {
			if (filename === null) {
				if (this.indexing) {
					this.deferRootReconcile(root, eventType === 'change', this.rootsToReconcileAfterIndex);
					return;
				}
				this.scheduleRootReconcile(root);
				return;
			}
			const changedPath = path.resolve(root.path, filename.toString());
			const forceChange = eventType === 'change';
			if (this.indexing) {
				this.changesDuringIndex.set(
					changedPath,
					this.changesDuringIndex.get(changedPath) === true || forceChange,
				);
				return;
			}
			this.queueChange(changedPath, forceChange);
		});
		watcher.on('error', (error) => this.handleError(error));
		this.watchers.set(watcher, root);
	}

	private scheduleRootReconcile(root: WatchRoot, notifyRescan = true): void {
		if (this.closed) return;
		const key = rootKey(root);
		this.pendingRootReconcileNotifications.set(
			key,
			this.pendingRootReconcileNotifications.get(key) === true || notifyRescan,
		);
		const pending = this.pendingRootReconciles.get(key);
		if (pending) clearTimeout(pending);
		const timer = setTimeout(() => {
			this.pendingRootReconciles.delete(key);
			const reconcileRequest = {
				root,
				notifyRescan: this.pendingRootReconcileNotifications.get(key) === true,
			};
			this.pendingRootReconcileNotifications.delete(key);
			this.beginRootReconcile(reconcileRequest);
		}, CHANGE_COALESCING_MS);
		this.pendingRootReconciles.set(key, timer);
	}

	private beginRootReconcile(request: RootReconcileRequest): void {
		if (this.indexing) {
			this.deferRootReconcile(request.root, request.notifyRescan, this.rootsToReconcileAfterIndex);
			return;
		}
		const key = rootKey(request.root);
		if (this.activeRootReconciles.has(key)) {
			this.deferRootReconcile(request.root, request.notifyRescan, this.rootsToReconcileAgain);
			return;
		}
		const reconciliation = this.reconcileWatchRoot(request.root, request.notifyRescan);
		this.activeRootReconciles.set(key, reconciliation);
		void reconciliation
			.catch((error: unknown) => this.handleError(error))
			.finally(() => {
				this.activeRootReconciles.delete(key);
				const nextRequest = this.rootsToReconcileAgain.get(key);
				this.rootsToReconcileAgain.delete(key);
				if (nextRequest) this.scheduleRootReconcile(nextRequest.root, nextRequest.notifyRescan);
			});
	}

	private deferRootReconcile(
		root: WatchRoot,
		notifyRescan: boolean,
		requests: Map<string, RootReconcileRequest>,
	): void {
		const key = rootKey(root);
		requests.set(key, {
			root,
			notifyRescan: requests.get(key)?.notifyRescan === true || notifyRescan,
		});
	}

	/**
	 * @remarks
	 * Some platforms omit filenames from native watch events. A root scan reconciles known entries so one such event
	 * cannot leave the subscription stale. A reconciliation can emit rescan events for mapped requested paths so
	 * consumers can invalidate the affected roots.
	 */
	private async reconcileWatchRoot(root: WatchRoot, notifyRescan: boolean): Promise<void> {
		if (this.closed) return;
		const snapshot = await this.scanWatchRoot(root);
		const removedEntries = this.getRemovedReconciliationEntries(root, snapshot);
		if (this.indexing) {
			for (const [entryPath] of removedEntries) this.deferIndexedChange(entryPath);
			for (const entryPath of snapshot.changedEntries) this.deferIndexedChange(entryPath);
			return;
		}
		for (const [entryPath] of removedEntries) {
			if (this.closed) return;
			await this.reconcileRemovedEntry(entryPath);
		}
		for (const entryPath of snapshot.changedEntries) {
			if (this.closed) return;
			await this.reconcileCurrentEntry(entryPath);
		}
		if (notifyRescan && !this.closed)
			for (const rescanPath of this.getMappedRescanPaths(root)) {
				if (this.closed) return;
				this.options.onChange({ type: 'rescan', path: rescanPath });
			}
	}

	private async scanWatchRoot(root: WatchRoot): Promise<{
		entries: Set<string>;
		changedEntries: Set<string>;
		unreadableDirectories: Set<string>;
	}> {
		const entries = new Set<string>();
		const changedEntries = new Set<string>();
		const unreadableDirectories = new Set<string>();
		let rootStats: Stats | undefined;
		try {
			rootStats = await tryStatAsync(root.path);
		} catch (error) {
			if (isPermissionError(error)) {
				unreadableDirectories.add(root.path);
				return { entries, changedEntries, unreadableDirectories };
			}
			throw error;
		}
		let canRecurse = !root.recursive;
		if (root.recursive && rootStats)
			canRecurse = this.collectReconciliationEntry(root.path, rootStats, entries, changedEntries);
		if (rootStats?.isDirectory() && canRecurse)
			await this.collectReconciliationChildren(
				root.path,
				root.recursive,
				entries,
				changedEntries,
				unreadableDirectories,
			);
		return { entries, changedEntries, unreadableDirectories };
	}

	private getRemovedReconciliationEntries(
		root: WatchRoot,
		snapshot: { entries: Set<string>; unreadableDirectories: Set<string> },
	): Array<[string, EntryKind]> {
		const removedEntries = [...this.knownEntries.entries()]
			.filter(
				([entryPath]) =>
					isPathWatchedByRoot(entryPath, root) &&
					!snapshot.entries.has(entryPath) &&
					![...snapshot.unreadableDirectories].some((directoryPath) =>
						isSameOrInside(entryPath, directoryPath),
					),
			)
			.sort(([left], [right]) => right.length - left.length);
		return removedEntries;
	}

	private async reconcileRemovedEntry(entryPath: string): Promise<void> {
		let stats: Stats | undefined;
		try {
			stats = await tryLstatAsync(entryPath);
		} catch (error) {
			if (isPermissionError(error)) return;
			throw error;
		}
		if (this.closed) return;
		if (stats) {
			const mappedPaths = this.getMappedPaths(entryPath, stats);
			if (mappedPaths.length) {
				this.flushPresentPath(entryPath, stats, this.knownEntries.get(entryPath), mappedPaths);
				return;
			}
		}
		this.flushRemovedPath(entryPath, this.knownEntries.get(entryPath), this.getMappedPaths(entryPath));
	}

	private async reconcileCurrentEntry(entryPath: string): Promise<void> {
		let stats: Stats | undefined;
		try {
			stats = await tryLstatAsync(entryPath);
		} catch (error) {
			if (isPermissionError(error)) return;
			throw error;
		}
		if (this.closed) return;
		if (!stats) {
			this.flushRemovedPath(entryPath, this.knownEntries.get(entryPath), this.getMappedPaths(entryPath));
			return;
		}
		const mappedPaths = this.getMappedPaths(entryPath, stats);
		if (!mappedPaths.length) {
			this.flushRemovedPath(entryPath, this.knownEntries.get(entryPath), mappedPaths);
			return;
		}
		this.flushPresentPath(entryPath, stats, this.knownEntries.get(entryPath), mappedPaths);
	}

	private async collectReconciliationChildren(
		directoryPath: string,
		recursive: boolean,
		entries: Set<string>,
		changedEntries: Set<string>,
		unreadableDirectories: Set<string>,
	): Promise<void> {
		let children;
		try {
			children = await readdirAsync(directoryPath, { withFileTypes: true });
		} catch (error) {
			if (isPermissionError(error)) {
				unreadableDirectories.add(directoryPath);
				return;
			}
			throw error;
		}
		for (const child of children) {
			if (this.closed) return;
			const childPath = path.join(directoryPath, child.name);
			let stats: Stats | undefined;
			try {
				stats = await tryLstatAsync(childPath);
			} catch (error) {
				if (isPermissionError(error)) {
					unreadableDirectories.add(childPath);
					continue;
				}
				throw error;
			}
			if (!stats) continue;
			const canRecurse = this.collectReconciliationEntry(childPath, stats, entries, changedEntries);
			if (recursive && canRecurse && stats.isDirectory() && !stats.isSymbolicLink()) {
				await this.collectReconciliationChildren(
					childPath,
					recursive,
					entries,
					changedEntries,
					unreadableDirectories,
				);
			}
		}
	}

	private deferIndexedChange(entryPath: string): void {
		this.changesDuringIndex.set(entryPath, this.changesDuringIndex.get(entryPath) === true);
	}

	private collectReconciliationEntry(
		entryPath: string,
		stats: Stats,
		entries: Set<string>,
		changedEntries: Set<string>,
	): boolean {
		const mappedPaths = this.getMappedPaths(entryPath, stats);
		if (mappedPaths.length) {
			entries.add(entryPath);
			if (this.hasReconciliationChanged(entryPath, stats)) changedEntries.add(entryPath);
		}
		return mappedPaths.length > 0;
	}

	private hasReconciliationChanged(entryPath: string, stats: Stats): boolean {
		const previousKind = this.knownEntries.get(entryPath);
		if (!previousKind || previousKind !== getEntryKind(stats)) return true;
		const previousStats = this.knownStats.get(entryPath);
		return !previousStats || !hasSameEntryVersion(previousStats, stats);
	}

	private ensureRecursiveWatcher(directoryPath: string): void {
		if (
			[...this.watchers.values()].some(
				({ path: root, recursive }) => recursive && isSameOrInside(directoryPath, root),
			)
		)
			return;
		try {
			this.openWatcher({ path: directoryPath, recursive: true });
		} catch (error) {
			this.handleError(error);
		}
	}

	private ensureNonRecursiveWatcher(directoryPath: string): void {
		if (
			[...this.watchers.values()].some(
				({ path: root, recursive }) =>
					root === directoryPath || (recursive && isSameOrInside(directoryPath, root)),
			)
		)
			return;
		try {
			this.openWatcher({ path: directoryPath, recursive: false, transient: true });
		} catch (error) {
			this.handleError(error);
		}
	}

	/**
	 * @remarks
	 * A missing target may be several levels below its nearest existing parent. Each newly created ancestor gets a
	 * non-recursive watch so the next missing segment can be followed without recursively watching unrelated files.
	 */
	private watchMissingPathAncestors(canonicalPath: string, stats: Stats | undefined): void {
		if (!stats?.isDirectory()) return;
		for (const watchedPath of this.watchedPaths) {
			if (
				watchedPath.canonicalPath === canonicalPath ||
				!isSameOrInside(watchedPath.canonicalPath, canonicalPath) ||
				this.isIgnoredAncestor(canonicalPath, watchedPath, stats)
			)
				continue;
			this.ensureNonRecursiveWatcher(canonicalPath);
			this.catchUpMissingPath(watchedPath, canonicalPath);
		}
	}

	private catchUpMissingPath(watchedPath: WatchedPath, existingAncestor: string): void {
		const relativePath = path.relative(existingAncestor, watchedPath.canonicalPath);
		const segments = relativePath.split(path.sep).filter(Boolean);
		let currentPath = existingAncestor;
		for (const segment of segments.slice(0, -1)) {
			currentPath = path.join(currentPath, segment);
			const stats = tryStat(currentPath);
			if (!stats?.isDirectory() || this.isIgnoredAncestor(currentPath, watchedPath, stats)) return;
			this.ensureNonRecursiveWatcher(currentPath);
		}
		if (tryStat(watchedPath.canonicalPath)) this.queueChange(watchedPath.canonicalPath);
	}

	private isIgnoredAncestor(canonicalPath: string, watchedPath: WatchedPath, stats: Stats): boolean {
		if (!this.options.ignored) return false;
		const relativePath = path.relative(watchedPath.rootPath, canonicalPath);
		const requestedPath = path.join(watchedPath.requestedRootPath, relativePath);
		let currentPath = requestedPath;
		while (isSameOrInside(currentPath, watchedPath.requestedRootPath)) {
			const currentStats =
				currentPath === requestedPath ? stats : (this.knownStats.get(currentPath) ?? tryStat(currentPath));
			try {
				if (this.options.ignored(currentPath, currentStats ? toFileStats(currentStats) : undefined))
					return true;
			} catch (error) {
				this.handleError(error);
				return true;
			}
			if (currentPath === watchedPath.requestedRootPath) break;
			currentPath = path.dirname(currentPath);
		}
		return false;
	}

	private closeWatchersUnder(directoryPath: string): void {
		for (const [watcher, root] of this.watchers) {
			if (isSameOrInside(root.path, directoryPath)) {
				watcher.close();
				this.watchers.delete(watcher);
			}
		}
	}

	private async seedKnownEntries(watchedPaths: readonly WatchedPath[]): Promise<void> {
		for (const watchedPath of watchedPaths) {
			if (this.closed) return;
			const stats = await tryStatAsync(watchedPath.canonicalPath);
			if (!stats || !this.getMappedPaths(watchedPath.canonicalPath, stats).length) continue;
			const kind = getEntryKind(stats);
			this.knownEntries.set(watchedPath.canonicalPath, kind);
			this.knownStats.set(watchedPath.canonicalPath, stats);
			this.promoteUnknownPaths(watchedPath.canonicalPath, kind);
			if (watchedPath.scope === 'file') {
				continue;
			}
			if (kind === 'directory') await this.seedDirectory(watchedPath.canonicalPath);
		}
	}

	private async seedDirectory(directoryPath: string): Promise<void> {
		if (this.closed) return;
		let entries;
		try {
			entries = await readdirAsync(directoryPath, { withFileTypes: true });
		} catch (error) {
			if (isPermissionError(error)) return;
			throw error;
		}

		for (const entry of entries) {
			if (this.closed) return;
			const entryPath = path.join(directoryPath, entry.name);
			const stats = await tryLstatAsync(entryPath);
			if (!stats || !this.getMappedPaths(entryPath, stats).length) continue;
			const kind: EntryKind = entry.isDirectory() && !entry.isSymbolicLink() ? 'directory' : 'file';
			this.knownEntries.set(entryPath, kind);
			this.knownStats.set(entryPath, stats);
			if (kind === 'directory') await this.seedDirectory(entryPath);
		}
	}

	private queueChange(canonicalPath: string, forceChange = false): void {
		if (this.closed) return;
		try {
			const stats = tryLstat(canonicalPath);
			if (this.isInsideIgnoredDirectory(canonicalPath)) return;
			this.watchMissingPathAncestors(canonicalPath, stats);
			if (!this.getMappedPaths(canonicalPath, stats).length) return;
			const existing = this.pendingChanges.get(canonicalPath);
			if (existing) clearTimeout(existing.timer);
			const timer = setTimeout(() => {
				const pending = this.pendingChanges.get(canonicalPath);
				this.pendingChanges.delete(canonicalPath);
				try {
					this.flushChange(canonicalPath, pending?.forceChange === true);
				} catch (error) {
					this.handleError(error);
				}
			}, CHANGE_COALESCING_MS);
			this.pendingChanges.set(canonicalPath, {
				timer,
				forceChange: existing?.forceChange === true || forceChange,
			});
		} catch (error) {
			this.handleError(error);
		}
	}

	private flushChange(canonicalPath: string, forceChange: boolean): void {
		if (this.closed) return;
		const previousKind = this.knownEntries.get(canonicalPath);
		const stats = tryLstat(canonicalPath);
		const mappedPaths = this.getMappedPaths(canonicalPath, stats);
		if (!mappedPaths.length) return;

		if (!stats) {
			this.flushRemovedPath(canonicalPath, previousKind, mappedPaths);
			return;
		}

		this.flushPresentPath(canonicalPath, stats, previousKind, mappedPaths, forceChange);
	}

	private flushRemovedPath(canonicalPath: string, previousKind: EntryKind | undefined, mappedPaths: string[]): void {
		if (!previousKind) return;
		this.emitChange(previousKind === 'directory' ? 'unlinkDir' : 'unlink', mappedPaths);
		this.knownEntries.delete(canonicalPath);
		this.knownStats.delete(canonicalPath);
		if (previousKind === 'directory') {
			this.closeWatchersUnder(canonicalPath);
			this.removeKnownDescendants(canonicalPath);
		}
	}

	private flushPresentPath(
		canonicalPath: string,
		stats: Stats,
		previousKind: EntryKind | undefined,
		mappedPaths: string[],
		forceChange = false,
	): void {
		const nextKind = getEntryKind(stats);
		const previousStats = this.knownStats.get(canonicalPath);
		if (isUnchangedFile(previousKind, nextKind, previousStats, stats, forceChange)) return;
		if (previousKind && previousKind !== nextKind)
			this.removeReplacedEntry(canonicalPath, previousKind, mappedPaths);
		this.knownEntries.set(canonicalPath, nextKind);
		this.knownStats.set(canonicalPath, stats);
		this.promoteUnknownPaths(canonicalPath, nextKind);
		if (nextKind === 'directory') this.ensureRecursiveWatcher(canonicalPath);

		if (previousKind === nextKind && nextKind === 'directory') return;
		const eventType = previousKind === nextKind ? 'change' : nextKind === 'directory' ? 'addDir' : 'add';
		this.emitChange(eventType, mappedPaths);
		if (!previousKind && nextKind === 'directory') {
			void this.seedAddedDirectory(canonicalPath).catch((error: unknown) => this.handleError(error));
		}
	}

	private removeReplacedEntry(canonicalPath: string, previousKind: EntryKind, mappedPaths: string[]): void {
		this.emitChange(previousKind === 'directory' ? 'unlinkDir' : 'unlink', mappedPaths);
		if (previousKind !== 'directory') return;
		this.closeWatchersUnder(canonicalPath);
		this.removeKnownDescendants(canonicalPath);
	}

	private async seedAddedDirectory(directoryPath: string): Promise<void> {
		if (this.closed) return;
		let entries;
		try {
			entries = await readdirAsync(directoryPath, { withFileTypes: true });
		} catch (error) {
			if (isPermissionError(error)) return;
			throw error;
		}

		for (const entry of entries) {
			if (this.closed) return;
			const entryPath = path.join(directoryPath, entry.name);
			const stats = await tryLstatAsync(entryPath);
			if (!stats || this.knownEntries.has(entryPath)) continue;
			const mappedPaths = this.getMappedPaths(entryPath, stats);
			if (!mappedPaths.length) continue;
			const kind: EntryKind = entry.isDirectory() && !entry.isSymbolicLink() ? 'directory' : 'file';
			this.knownEntries.set(entryPath, kind);
			this.knownStats.set(entryPath, stats);
			this.cancelPendingChange(entryPath);
			this.promoteUnknownPaths(entryPath, kind);
			this.emitChange(kind === 'directory' ? 'addDir' : 'add', mappedPaths);
			if (kind === 'directory') {
				this.ensureRecursiveWatcher(entryPath);
				await this.seedAddedDirectory(entryPath);
			}
		}
	}

	private removeKnownDescendants(directoryPath: string): void {
		const descendants = [...this.knownEntries.entries()]
			.filter(([entryPath]) => entryPath !== directoryPath && isSameOrInside(entryPath, directoryPath))
			.sort(([left], [right]) => right.length - left.length);
		for (const [entryPath, kind] of descendants) {
			this.cancelPendingChange(entryPath);
			this.emitChange(kind === 'directory' ? 'unlinkDir' : 'unlink', this.getMappedPaths(entryPath));
			this.knownEntries.delete(entryPath);
			this.knownStats.delete(entryPath);
		}
	}

	private cancelPendingChange(canonicalPath: string): void {
		const pending = this.pendingChanges.get(canonicalPath);
		if (!pending) return;
		clearTimeout(pending.timer);
		this.pendingChanges.delete(canonicalPath);
	}

	private promoteUnknownPaths(canonicalPath: string, kind: EntryKind): void {
		for (const watchedPath of this.watchedPaths) {
			if (watchedPath.scope === 'unknown' && watchedPath.canonicalPath === canonicalPath) {
				watchedPath.scope = kind;
				watchedPath.rootPath = kind === 'directory' ? canonicalPath : path.dirname(canonicalPath);
				watchedPath.requestedRootPath =
					kind === 'directory' ? watchedPath.requestedPath : path.dirname(watchedPath.requestedPath);
			}
		}
	}

	private getMappedPaths(canonicalPath: string, stats?: Stats): string[] {
		const mappedPaths: string[] = [];
		let hasMatchingPath = false;
		for (const watchedPath of this.watchedPaths) {
			if (watchedPath.scope === 'file' || watchedPath.scope === 'unknown') {
				if (watchedPath.canonicalPath !== canonicalPath) continue;
			} else if (!isSameOrInside(canonicalPath, watchedPath.canonicalPath)) {
				continue;
			}

			const relativePath = path.relative(watchedPath.canonicalPath, canonicalPath);
			const reportedPath = relativePath
				? path.join(watchedPath.requestedPath, relativePath)
				: watchedPath.requestedPath;
			hasMatchingPath = true;
			if (this.isIgnored(reportedPath, watchedPath, stats)) continue;
			mappedPaths.push(reportedPath);
		}
		if (hasMatchingPath && !mappedPaths.length && stats?.isDirectory()) this.ignoredDirectories.add(canonicalPath);
		return mappedPaths;
	}

	private getMappedRescanPaths(root: WatchRoot): string[] {
		const mappedPaths = new Set<string>();
		for (const watchedPath of this.watchedPaths) {
			if (root.recursive) {
				if (watchedPath.scope === 'directory' && watchedPath.canonicalPath === root.path)
					mappedPaths.add(watchedPath.requestedPath);
				continue;
			}
			if (watchedPath.rootPath === root.path) mappedPaths.add(watchedPath.requestedRootPath);
			else if (watchedPath.scope === 'directory' && path.dirname(watchedPath.canonicalPath) === root.path)
				mappedPaths.add(watchedPath.requestedPath);
		}
		return [...mappedPaths];
	}

	private isInsideIgnoredDirectory(canonicalPath: string): boolean {
		let currentPath = canonicalPath;
		while (true) {
			if (this.ignoredDirectories.has(currentPath)) return true;
			const parentPath = path.dirname(currentPath);
			if (parentPath === currentPath) return false;
			currentPath = parentPath;
		}
	}

	private isIgnored(reportedPath: string, watchedPath: WatchedPath, stats?: Stats): boolean {
		if (!this.options.ignored) return false;
		let currentPath = reportedPath;
		while (isSameOrInside(currentPath, watchedPath.requestedPath)) {
			const currentStats =
				currentPath === reportedPath ? stats : (this.knownStats.get(currentPath) ?? tryStat(currentPath));
			try {
				if (this.options.ignored(currentPath, currentStats ? toFileStats(currentStats) : undefined))
					return true;
			} catch (error) {
				this.handleError(error);
				return true;
			}
			if (currentPath === watchedPath.requestedPath) break;
			currentPath = path.dirname(currentPath);
		}
		return false;
	}

	private emitChange(type: FileChange['type'], paths: readonly string[]): void {
		const emitted = new Set<string>();
		for (const mappedPath of paths) {
			const key = `${type}:${mappedPath}`;
			if (emitted.has(key)) continue;
			emitted.add(key);
			this.options.onChange({ type, path: mappedPath });
		}
	}

	private handleError(error: unknown): void {
		if (this.closed) return;
		if (!this.readySettled) this.readyReject(error);
		this.options.onError(error);
	}
}

function minimizeRoots(candidates: readonly string[]): string[] {
	const roots: string[] = [];
	for (const candidate of [...new Set(candidates)].sort((left, right) => left.length - right.length)) {
		if (!roots.some((root) => isSameOrInside(candidate, root))) roots.push(candidate);
	}
	return roots;
}

function rootKey(root: WatchRoot): string {
	return `${root.recursive ? 'recursive' : 'flat'}:${root.path}`;
}

function resolveWatchedPath(input: string): WatchedPath {
	const requestedPath = path.resolve(input);
	let currentPath = requestedPath;
	const missingSegments: string[] = [];
	while (true) {
		const stats = tryStat(currentPath);
		if (stats) {
			const canonicalCurrentPath = realpathSync(currentPath);
			if (missingSegments.length === 0) {
				const isDirectory = stats.isDirectory();
				return {
					requestedPath,
					requestedRootPath: isDirectory ? requestedPath : path.dirname(requestedPath),
					canonicalPath: canonicalCurrentPath,
					rootPath: isDirectory ? canonicalCurrentPath : path.dirname(canonicalCurrentPath),
					scope: isDirectory ? 'directory' : 'file',
				};
			}
			if (!stats.isDirectory()) throw new Error(`Cannot watch a path below a file: ${currentPath}`);
			return {
				requestedPath,
				requestedRootPath: path.resolve(currentPath),
				canonicalPath: path.join(canonicalCurrentPath, ...missingSegments),
				rootPath: canonicalCurrentPath,
				scope: 'unknown',
			};
		}

		const parentPath = path.dirname(currentPath);
		if (parentPath === currentPath) throw new Error(`Cannot resolve a directory to watch for ${requestedPath}`);
		missingSegments.unshift(path.basename(currentPath));
		currentPath = parentPath;
	}
}

function tryStat(filePath: string): Stats | undefined {
	try {
		return statSync(filePath);
	} catch (error) {
		if (isMissingPathError(error)) return undefined;
		throw error;
	}
}

function tryLstat(filePath: string): Stats | undefined {
	try {
		return lstatSync(filePath);
	} catch (error) {
		if (isMissingPathError(error)) return undefined;
		throw error;
	}
}

async function tryStatAsync(filePath: string): Promise<Stats | undefined> {
	try {
		return await statAsync(filePath);
	} catch (error) {
		if (isMissingPathError(error)) return undefined;
		throw error;
	}
}

async function tryLstatAsync(filePath: string): Promise<Stats | undefined> {
	try {
		return await lstatAsync(filePath);
	} catch (error) {
		if (isMissingPathError(error)) return undefined;
		throw error;
	}
}

function isMissingPathError(error: unknown): boolean {
	return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function isPermissionError(error: unknown): boolean {
	return error instanceof Error && 'code' in error && (error.code === 'EACCES' || error.code === 'EPERM');
}

function getEntryKind(stats: Stats): EntryKind {
	return stats.isDirectory() ? 'directory' : 'file';
}

function hasSameEntryVersion(previous: Stats, next: Stats): boolean {
	return (
		previous.size === next.size &&
		previous.mtimeMs === next.mtimeMs &&
		previous.ctimeMs === next.ctimeMs &&
		previous.ino === next.ino
	);
}

function isUnchangedFile(
	previousKind: EntryKind | undefined,
	nextKind: EntryKind,
	previousStats: Stats | undefined,
	nextStats: Stats,
	forceChange: boolean,
): boolean {
	return (
		previousKind === 'file' &&
		nextKind === 'file' &&
		previousStats !== undefined &&
		!forceChange &&
		hasSameEntryVersion(previousStats, nextStats)
	);
}

function toFileStats(stats: Stats): FileStats {
	return {
		isFile: stats.isFile(),
		isDirectory: stats.isDirectory(),
		isSymbolicLink: stats.isSymbolicLink(),
		size: stats.size,
	};
}

function isSameOrInside(candidate: string, root: string): boolean {
	const relativePath = path.relative(root, candidate);
	return (
		relativePath === '' ||
		(relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath))
	);
}

function isPathWatchedByRoot(filePath: string, root: WatchRoot): boolean {
	return root.recursive ? isSameOrInside(filePath, root.path) : path.dirname(filePath) === root.path;
}
