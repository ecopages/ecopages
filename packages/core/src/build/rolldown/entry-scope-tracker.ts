import path from 'node:path';

/**
 * Tracks which entries of one build reach each module, so a plugin with an `entryScope` applies only to
 * modules its entries reach.
 *
 * @remarks
 * Rolldown loads each module once, but a later import can add an entry that reaches a module already
 * built. A scoped plugin that changed a module therefore stays valid only while every entry reaching it
 * is in the plugin's scope; a module that needs two builds fails the build instead of shipping one of them.
 * Reach is propagated along every recorded import, so the check also holds when the new entry arrives
 * through a module that was loaded earlier.
 */
export class EntryScopeTracker {
	private readonly entryNamesByPath = new Map<string, string[]>();
	private readonly reach = new Map<string, Set<string>>();
	private readonly imports = new Map<string, Set<string>>();
	private readonly builtBy = new Map<string, Array<{ pluginName: string; scope: ReadonlySet<string> }>>();

	constructor(entrypoints: Readonly<Record<string, string>>, contextRoot: string) {
		for (const [entryName, entrypoint] of Object.entries(entrypoints)) {
			const entryPath = path.resolve(contextRoot, entrypoint);
			this.entryNamesByPath.set(entryPath, [...(this.entryNamesByPath.get(entryPath) ?? []), entryName]);
		}
	}

	/** Records that `importer` imports `id`, or that `id` is an entry when `importer` is absent. */
	recordImport(importer: string | undefined, id: string, source?: string): void {
		if (importer === undefined) {
			const entryNames =
				this.entryNamesByPath.get(id) ?? (source ? this.entryNamesByPath.get(source) : undefined);
			if (entryNames) this.addReach(id, entryNames);
			return;
		}
		const imported = this.imports.get(importer) ?? new Set<string>();
		imported.add(id);
		this.imports.set(importer, imported);
		const importerReach = this.reach.get(importer);
		if (importerReach) this.addReach(id, importerReach);
	}

	/** Whether a plugin scoped to `scope` applies to `id`, judged by the entries reaching it so far. */
	applies(scope: ReadonlySet<string>, id: string | undefined): boolean {
		const entries = id === undefined ? undefined : this.reach.get(id);
		if (!entries) return false;
		for (const entryName of entries) {
			if (scope.has(entryName)) return true;
		}
		return false;
	}

	/** Records that a scoped plugin built `id`, and fails when an entry outside its scope reaches it. */
	recordBuiltBy(id: string, pluginName: string, scope: ReadonlySet<string>): void {
		const builders = this.builtBy.get(id) ?? [];
		builders.push({ pluginName, scope });
		this.builtBy.set(id, builders);
		this.assertInScope(id);
	}

	private addReach(id: string, entryNames: Iterable<string>): void {
		const pending: Array<[string, Iterable<string>]> = [[id, entryNames]];
		while (pending.length > 0) {
			const [moduleId, names] = pending.pop()!;
			const current = this.reach.get(moduleId) ?? new Set<string>();
			const added = [...names].filter((name) => !current.has(name));
			if (added.length === 0) continue;
			for (const name of added) current.add(name);
			this.reach.set(moduleId, current);
			this.assertInScope(moduleId);
			for (const imported of this.imports.get(moduleId) ?? []) {
				pending.push([imported, added]);
			}
		}
	}

	private assertInScope(id: string): void {
		const entries = this.reach.get(id);
		if (!entries) return;
		for (const { pluginName, scope } of this.builtBy.get(id) ?? []) {
			const outside = [...entries].filter((entryName) => !scope.has(entryName));
			if (outside.length > 0) {
				throw new Error(
					`[ecopages] ${id} is imported by browser entries that need different builds of it: ` +
						`the "${pluginName}" plugin builds it for ${formatEntries(scope)}, ` +
						`but ${formatEntries(outside)} also import it. ` +
						`Move the code those entries share into a module that does not depend on "${pluginName}".`,
				);
			}
		}
	}
}

function formatEntries(entryNames: Iterable<string>): string {
	return [...entryNames]
		.sort()
		.map((entryName) => `"${entryName}"`)
		.join(', ');
}
