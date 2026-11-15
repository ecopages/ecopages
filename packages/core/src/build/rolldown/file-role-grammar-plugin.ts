import type { RolldownPlugin } from 'rolldown';
import { describeRoleForms, findMisplacedRole } from '../../utils/file-roles.ts';
import { fromRolldownModuleId } from './rolldown-module-id.ts';

const ROLE_FILE_PATTERN = /\.(?:api|server|script)\.[^/\\]*\.(?:[cm]?[jt]sx?)$/u;

/**
 * Fails a build that compiles an app module whose name puts a role segment anywhere but directly before a script
 * extension, such as `card.server.kita.tsx`.
 *
 * @remarks
 * Role suffixes follow `<name>.<role>.<ts|tsx|js|jsx>`. The router enforces that for route files; this plugin
 * covers every other module the build compiles, wherever it lives, so a misplaced segment never reads two ways.
 * Modules under `node_modules` are installed packages and are not checked.
 */
export function createFileRoleGrammarPlugin(): RolldownPlugin {
	return {
		name: 'ecopages:file-role-grammar',
		transform: {
			filter: { id: ROLE_FILE_PATTERN },
			handler(_code, id) {
				if (id.startsWith('\0')) return null;
				const file = fromRolldownModuleId(id);
				if (file.split('/').includes('node_modules')) return null;
				const misplaced = findMisplacedRole(file);
				if (misplaced) {
					this.error(
						`${file}: the "${misplaced}" role segment must come directly before a script extension, as in ${describeRoleForms()}. Rename the file.`,
					);
				}
				return null;
			},
		},
	};
}
