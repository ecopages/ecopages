import type { RolldownPlugin } from 'rolldown';

/**
 * Keeps every export of every module, whatever imports it, when each module is emitted as its own file.
 *
 * @remarks
 * With `preserveModules`, Rolldown writes a module that is not an entry with the exports that the other modules of
 * the build use, so the file of a module changes when a later entry uses more of it, and the dev server's vendor
 * files would change for pages that already loaded them. Emitting each module as a chunk of its own with a strict
 * signature, through the public `emitFile`, makes Rolldown treat it as an entry: its file holds all of its exports.
 * A module whose id starts with `\0` is virtual and is left to Rolldown.
 */
export function createPreservedModuleSignaturesPlugin(): RolldownPlugin {
	const emitted = new Set<string>();
	return {
		name: 'ecopages:preserved-module-signatures',
		buildStart() {
			emitted.clear();
		},
		moduleParsed(info) {
			if (info.id.startsWith('\0') || emitted.has(info.id)) return;
			emitted.add(info.id);
			this.emitFile({ type: 'chunk', id: info.id, preserveSignature: 'strict' });
		},
	};
}
