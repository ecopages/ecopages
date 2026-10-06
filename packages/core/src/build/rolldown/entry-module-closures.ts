import type { RolldownPlugin } from 'rolldown';
import { fileURLToPath } from 'node:url';
import type { BuildDependencyGraph } from '../build-adapter.ts';
import { resolveBuildEntryPath } from '../build-graph.ts';

/**
 * @remarks
 * Source dependencies come from the module graph before emission can inline or
 * remove modules. External ids are retained as leaves for local file hashing.
 */
export function createEntryModuleClosuresPlugin(graph: BuildDependencyGraph, root: string): RolldownPlugin {
	return {
		name: 'ecopages-entry-module-closures',
		generateBundle() {
			const ids = new Set(this.getModuleIds());
			const infoById = new Map([...ids].map((id) => [id, this.getModuleInfo(id)]));
			const normalizedIds = new Map(
				[...ids].map((id) => [
					id,
					id.startsWith('file:')
						? fileURLToPath(id)
						: id.startsWith('\0') || !infoById.get(id)
							? id
							: resolveBuildEntryPath(id, root),
				]),
			);
			for (const id of ids) {
				if (!infoById.get(id)?.isEntry) continue;
				const closure = new Set([id]);
				for (const moduleId of closure) {
					const info = infoById.get(moduleId);
					if (!info) continue;
					for (const imported of [...info.importedIds, ...info.dynamicallyImportedIds]) closure.add(imported);
				}
				graph.entrypoints[resolveBuildEntryPath(id, root)] = [...closure].map(
					(moduleId) =>
						normalizedIds.get(moduleId) ??
						(moduleId.startsWith('file:') ? fileURLToPath(moduleId) : moduleId),
				);
			}
		},
	};
}
