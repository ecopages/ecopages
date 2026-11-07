import { path } from '@ecopages/file-system/path';

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:\//u;

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
 * written. Only a drive-letter path is converted: a root-relative id such as `/assets/vendors/react.js` is a URL
 * an external import keeps, not a file.
 */
export function toRolldownModuleId(id: string): string {
	if (!WINDOWS_DRIVE_PATH.test(id)) return id;
	const suffixIndex = id.search(/[?#]/u);
	return suffixIndex === -1
		? path.toNative(id)
		: `${path.toNative(id.slice(0, suffixIndex))}${id.slice(suffixIndex)}`;
}
