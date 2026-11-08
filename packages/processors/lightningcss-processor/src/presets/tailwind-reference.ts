import { path } from '@ecopages/file-system/path';

/** A stylesheet Lightning CSS scopes as a CSS Module. */
const CSS_MODULE_FILE = /\.module\.css$/iu;

const TAILWIND_IMPORT = /^@import\s+['"]tailwindcss(?:\/[^'"]*)?['"];?\s*$/mu;

/** The index just past the statement that starts at `from`: its `;`, skipping strings and parentheses, or the end. */
function statementEnd(css: string, from: number): number {
	let depth = 0;
	for (let index = from; index < css.length; index++) {
		const char = css[index]!;
		if (char === '"' || char === "'") {
			index = quotedEnd(css, index);
		} else if (char === '(') {
			depth++;
		} else if (char === ')') {
			depth = Math.max(0, depth - 1);
		} else if (char === ';' && depth === 0) {
			return index + 1;
		} else if (char === '{' && depth === 0) {
			return -1;
		}
	}
	return css.length;
}

/** The index of the quote that closes the string opened at `from`. */
function quotedEnd(css: string, from: number): number {
	for (let index = from + 1; index < css.length; index++) {
		if (css[index] === '\\') index++;
		else if (css[index] === css[from]) return index;
	}
	return css.length;
}

/** The index just past the comments, `@charset`, `@import` and `@layer` order statements that open `css`. */
function leadingStatementsEnd(css: string): number {
	let end = 0;
	let index = 0;
	while (index < css.length) {
		if (/\s/u.test(css[index]!)) {
			index++;
		} else if (css.startsWith('/*', index)) {
			const close = css.indexOf('*/', index + 2);
			end = index = close === -1 ? css.length : close + 2;
		} else if (css[index] === '@') {
			const name = /^@([\w-]+)/u.exec(css.slice(index, index + 32))?.[1]?.toLowerCase();
			if (name !== 'charset' && name !== 'import' && name !== 'layer') break;
			const close = statementEnd(css, index);
			if (close === -1) break;
			end = index = close;
		} else {
			break;
		}
	}
	return end;
}

/**
 * Adds `@reference` after the `@charset`, `@layer` and `@import` statements that open the stylesheet.
 *
 * @remarks
 * An `@import` is inlined only when every statement before it is an `@import`, a `@charset` or an empty `@layer`, so a
 * `@reference` placed first would leave the stylesheet's imports unresolved. A leading byte order mark stays first.
 */
export function insertReference(css: string, referencePath: string): string {
	const statement = `@reference "${referencePath}";`;
	const bom = css.startsWith('﻿') ? '﻿' : '';
	const body = css.slice(bom.length);
	const end = leadingStatementsEnd(body);
	if (end === 0) return `${bom}${statement}\n\n${body}`;
	return `${bom}${body.slice(0, end)}\n${statement}${body.slice(end)}`;
}

/**
 * Gives a stylesheet the theme of the Tailwind entry, so `@apply` finds the utilities of the app.
 *
 * @remarks
 * The entry itself, and a stylesheet that already references or imports the entry, stay as written. An
 * `@import "tailwindcss"` becomes an import of the entry so the app's theme applies. Any other stylesheet that uses
 * `@apply`, and every CSS Module, gets an `@reference`, which emits nothing of the entry.
 */
export function withReference(css: string, file: string, referencePath: string): string {
	if (path.resolve(file) === referencePath) return css;
	if (/^\s*@reference\s+/mu.test(css)) return css;
	if (css.includes(`@import '${referencePath}'`) || css.includes(`@import "${referencePath}"`)) return css;
	if (TAILWIND_IMPORT.test(css)) return css.replace(TAILWIND_IMPORT, `@import '${referencePath}';`);
	if (CSS_MODULE_FILE.test(file) || css.includes('@apply')) return insertReference(css, referencePath);
	return css;
}
