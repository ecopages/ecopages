import { path } from '@ecopages/file-system/path';

/**
 * Converts a module id Rolldown hands to a hook into an Ecopages path.
 *
 * @remarks
 * Rolldown's resolver returns native paths, so on Windows a module id arrives with backslashes. Virtual ids
 * (`\0...`) and bare specifiers pass through unchanged.
 */
export function fromRolldownModuleId(id: string): string {
	return path.fromNative(id);
}

/**
 * Converts a path a hook resolves into the module id form Rolldown's own resolver produces.
 *
 * @remarks
 * Rolldown keys modules by id string. On Windows its resolver returns backslash paths, so a plugin that resolved
 * the same file to a forward-slash id would make it a second module. A query or hash after the path is kept as
 * written. Ids that are not absolute paths pass through unchanged.
 */
export function toRolldownModuleId(id: string): string {
	if (!path.isAbsolute(id)) return id;
	const suffixIndex = id.search(/[?#]/u);
	return suffixIndex === -1
		? path.toNative(id)
		: `${path.toNative(id.slice(0, suffixIndex))}${id.slice(suffixIndex)}`;
}
