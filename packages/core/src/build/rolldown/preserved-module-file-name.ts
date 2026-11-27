import { createHash } from 'node:crypto';
import { path } from '@ecopages/file-system/path';

const MAX_FILE_NAME_BYTES = 120;
const DIGEST_LENGTH = 16;
const PLAIN_CHARACTER = /^[A-Za-z0-9._@=,-]$/u;
const SEGMENT_SEPARATOR = '+';
const ESCAPE = '~';

function encodeSegment(segment: string): string {
	let encoded = '';
	for (const character of segment) {
		encoded += PLAIN_CHARACTER.test(character)
			? character
			: `${ESCAPE}${character.codePointAt(0)!.toString(16)}${ESCAPE}`;
	}
	return encoded;
}

function keepEnd(value: string, maximumBytes: number): string {
	let end = '';
	let bytes = 0;
	for (const character of [...value].reverse()) {
		const characterBytes = Buffer.byteLength(character);
		if (bytes + characterBytes > maximumBytes) break;
		end = `${character}${end}`;
		bytes += characterBytes;
	}
	return end;
}

/**
 * The file name, without a graph prefix or `.js`, of the preserved module at `modulePath`.
 *
 * @remarks
 * The name is the module's path relative to `root` with its extension, a segment at a time joined by `+`, and a
 * character other than a letter, digit or `._@=,-` (the `+` and `~` of a segment included) is written `~<hex>~`.
 * Two paths therefore never share a name, `index.js` and `index.mjs` next to each other included, and the name is
 * safe in a URL, an import specifier and a file system without escaping. It depends on the module's path alone, so
 * it is the same whether the module is an entry and whatever else the build holds. A name over the length a file
 * system accepts is a digest of the whole name followed by its end, which keeps the package and file readable.
 */
export function getPreservedModuleFileName(root: string, modulePath: string): string {
	const segments = path
		.relative(root, modulePath)
		.split('/')
		.filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
		.map(encodeSegment);
	const name = segments.join(SEGMENT_SEPARATOR);
	if (Buffer.byteLength(name) <= MAX_FILE_NAME_BYTES) return name;
	const digest = createHash('sha256').update(name).digest('hex').slice(0, DIGEST_LENGTH);
	return `${digest}-${keepEnd(name, MAX_FILE_NAME_BYTES - digest.length - 1)}`;
}
