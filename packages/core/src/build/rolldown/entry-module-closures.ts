import type { RolldownPlugin } from 'rolldown';
import { path } from '@ecopages/file-system/path';
import type { BuildDependencyGraph } from '../build-adapter.ts';
import { resolveBuildEntryPath } from '../build-graph.ts';
import type { WatchFilesByModule } from './rolldown-plugin-bridge.ts';
import { fromRolldownModuleId } from './rolldown-module-id.ts';

/**
 * @remarks
 * Source dependencies come from the module graph before emission can inline or
 * remove modules. External ids are retained as leaves for local file hashing.
 * The files a plugin declared with `addWatchFile` for a module join the closure
 * of every entry that holds that module. An entry whose module Rolldown detected
 * as CommonJS is also listed in `commonJsEntrypoints`.
 */
export function createEntryModuleClosuresPlugin(
	graph: BuildDependencyGraph,
	root: string,
	watchFiles: WatchFilesByModule,
): RolldownPlugin {
	return {
		name: 'ecopages-entry-module-closures',
		generateBundle() {
			const ids = new Set(this.getModuleIds());
			const infoById = new Map([...ids].map((id) => [id, this.getModuleInfo(id)]));
			const normalizedIds = new Map(
				[...ids].map((id) => [
					id,
					id.startsWith('file:')
						? path.fromFileUrl(id)
						: id.startsWith('\0') || !infoById.get(id) || !path.isAbsolute(id)
							? fromRolldownModuleId(id)
							: resolveBuildEntryPath(id, root),
				]),
			);
			for (const id of ids) {
				const entryInfo = infoById.get(id);
				if (!entryInfo?.isEntry) continue;
				const entryPath = resolveBuildEntryPath(id, root);
				const commonJsEntrypoints = (graph.commonJsEntrypoints ??= []);
				if (entryInfo.inputFormat === 'cjs' && !commonJsEntrypoints.includes(entryPath)) {
					commonJsEntrypoints.push(entryPath);
				}
				const closure = new Set([id]);
				for (const moduleId of closure) {
					const info = infoById.get(moduleId);
					if (!info) continue;
					for (const imported of [...info.importedIds, ...info.dynamicallyImportedIds]) closure.add(imported);
				}
				const modules = [...closure].map(
					(moduleId) =>
						normalizedIds.get(moduleId) ??
						(moduleId.startsWith('file:') ? path.fromFileUrl(moduleId) : fromRolldownModuleId(moduleId)),
				);
				const declared = [...closure].flatMap((moduleId) => [
					...(watchFiles.get(fromRolldownModuleId(moduleId)) ?? []),
				]);
				graph.entrypoints[entryPath] = [...new Set([...modules, ...declared])];
			}
		},
	};
}
