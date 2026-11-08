import { toClassMapModule, toStylesheetModule } from './stylesheet-module.ts';

/** The module a binding import of a stylesheet that never compiled receives: an empty class map or an empty string. */
export function emptyStylesheetModule(isCssModule: boolean): string {
	return isCssModule ? toClassMapModule({}) : toStylesheetModule('');
}
