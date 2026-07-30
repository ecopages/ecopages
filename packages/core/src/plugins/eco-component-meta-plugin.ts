import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { prependJsxImportSourceIfMissing } from './jsx-import-source.utils.ts';
import type { EcoSourceTransform, EcoViteCompatiblePlugin } from './source-transform.ts';
import { createEcoBuildPluginFromSourceTransform, createVitePluginFromSourceTransform } from './source-transform.ts';
import type { EcoBuildPlugin } from '../build/contracts/build-types.ts';
import { rapidhash } from '../utils/hash.ts';

type IntegrationOwnership = { name: string; jsxImportSource?: string };

export interface EcoComponentDirPluginOptions {
	config: EcoPagesAppConfig;
}

function integrationForFile(filePath: string, config: EcoPagesAppConfig): IntegrationOwnership {
	const candidates = config.integrations
		.flatMap((integration) => integration.extensions.map((extension) => [extension, integration] as const))
		.sort(([left], [right]) => right.length - left.length);
	const match = candidates.find(([extension]) => filePath.endsWith(extension));
	return match ? { name: match[1].name, jsxImportSource: match[1].jsxImportSource } : { name: 'ghtml' };
}

function isIdentifierCharacter(value: string | undefined): boolean {
	return Boolean(value && 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$'.includes(value));
}

function isWhitespace(value: string | undefined): boolean {
	return value === ' ' || value === '\t' || value === '\n' || value === '\r';
}

function readFactoryName(source: string, start: number): string | undefined {
	for (const name of ['page', 'component', 'layout', 'html']) {
		if (source.startsWith(name, start) && !isIdentifierCharacter(source[start + name.length])) {
			return name;
		}
	}
	return undefined;
}

function skipNonCode(source: string, start: number): number | undefined {
	const character = source[start];
	const next = source[start + 1];
	if (character === '/' && next === '/') {
		const lineEnd = source.indexOf('\n', start + 2);
		return lineEnd < 0 ? source.length : lineEnd;
	}
	if (character === '/' && next === '*') {
		const commentEnd = source.indexOf('*/', start + 2);
		return commentEnd < 0 ? source.length : commentEnd + 1;
	}
	if (character !== '"' && character !== "'" && character !== '`') {
		return undefined;
	}
	for (let index = start + 1; index < source.length; index += 1) {
		if (source[index] === '\\') {
			index += 1;
			continue;
		}
		if (source[index] === character) {
			return index;
		}
	}
	return source.length;
}

/**
 * Finds the matching closing delimiter without treating comments, strings, or
 * template literals as source syntax.
 */
function findClosingDelimiter(source: string, start: number, open: string, close: string): number | undefined {
	let depth = 0;
	let quote: string | undefined;
	for (let index = start; index < source.length; index += 1) {
		const character = source[index];
		const next = source[index + 1];
		if (quote) {
			if (character === '\\') {
				index += 1;
			} else if (character === quote) {
				quote = undefined;
			}
			continue;
		}
		if (character === '/' && next === '/') {
			index = source.indexOf('\n', index + 2);
			if (index < 0) return undefined;
			continue;
		}
		if (character === '/' && next === '*') {
			index = source.indexOf('*/', index + 2);
			if (index < 0) return undefined;
			index += 1;
			continue;
		}
		if (character === '"' || character === "'" || character === '`') {
			quote = character;
			continue;
		}
		if (character === open) depth += 1;
		if (character === close) {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	return undefined;
}

function findFactoryObjectStarts(source: string): number[] {
	const starts: number[] = [];
	for (let index = 0; index < source.length; index += 1) {
		const skipped = skipNonCode(source, index);
		if (skipped !== undefined) {
			index = skipped;
			continue;
		}
		if (!source.startsWith('eco.', index) || isIdentifierCharacter(source[index - 1])) continue;
		const factoryName = readFactoryName(source, index + 4);
		if (!factoryName) continue;
		let cursor = index + 4 + factoryName.length;
		while (isWhitespace(source[cursor])) cursor += 1;
		if (source[cursor] === '<') {
			let genericDepth = 0;
			while (cursor < source.length) {
				if (source[cursor] === '<') genericDepth += 1;
				if (source[cursor] === '>' && source[cursor - 1] !== '=') {
					genericDepth -= 1;
					if (genericDepth === 0) break;
				}
				cursor += 1;
			}
			if (genericDepth !== 0) continue;
			cursor += 1;
			while (isWhitespace(source[cursor])) cursor += 1;
		}
		if (source[cursor] !== '(') continue;
		cursor += 1;
		while (isWhitespace(source[cursor])) cursor += 1;
		if (source[cursor] === '{') starts.push(cursor);
	}
	return starts;
}

function findConfigAssignmentObjectStarts(source: string): number[] {
	const starts: number[] = [];
	for (let index = 0; index < source.length; index += 1) {
		const skipped = skipNonCode(source, index);
		if (skipped !== undefined) {
			index = skipped;
			continue;
		}
		if (!source.startsWith('.config', index)) continue;
		let cursor = index + '.config'.length;
		while (isWhitespace(source[cursor])) cursor += 1;
		if (source[cursor] !== '=') continue;
		cursor += 1;
		while (isWhitespace(source[cursor])) cursor += 1;
		if (source[cursor] === '{') starts.push(cursor);
	}
	return starts;
}

/**
 * Adds lexical module attribution only to literal `eco.*({...})` declarations.
 *
 * @remarks
 * This deliberately avoids recursive config/object matching. The scanner tracks
 * JavaScript lexical state and balanced delimiters, so comments and strings do
 * not create false factory declarations.
 */
export function injectEcoMeta(contents: string, filePath: string, integration: string): string {
	if (!contents.includes('eco.') && !contents.includes('.config')) return contents;
	const identity = ` identity: { id: "${rapidhash(filePath).toString(36)}", file: "${filePath}", integration: "${integration}" },`;
	const starts = [...findFactoryObjectStarts(contents), ...findConfigAssignmentObjectStarts(contents)];
	if (starts.length === 0) return contents;
	let transformed = contents;
	for (const start of starts.sort((left, right) => right - left)) {
		transformed = `${transformed.slice(0, start + 1)}${identity}${transformed.slice(start + 1)}`;
	}
	return transformed;
}

export function createEcoComponentMetaTransform(options: EcoComponentDirPluginOptions): EcoSourceTransform {
	const extensions = options.config.integrations
		.flatMap((integration) => integration.extensions)
		.filter((extension) => ['.ts', '.tsx', '.js', '.jsx'].some((suffix) => extension.endsWith(suffix)))
		.map((extension) => extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	const filter = new RegExp(`(${extensions.join('|')})(\\?.*)?$`);
	return {
		name: 'eco-component-identity-attribution',
		enforce: 'pre',
		filter,
		transform(code, id) {
			if (id.endsWith('.mdx')) return { code };
			const integration = integrationForFile(id, options.config);
			return { code: prependJsxImportSourceIfMissing(injectEcoMeta(code, id, integration.name), integration.jsxImportSource) };
		},
	};
}

export function createEcoComponentMetaVitePlugin(options: EcoComponentDirPluginOptions): EcoViteCompatiblePlugin {
	return createVitePluginFromSourceTransform(createEcoComponentMetaTransform(options));
}

/** @deprecated App configuration registers the source transform directly. */
export function createEcoComponentMetaPlugin(options: EcoComponentDirPluginOptions): EcoBuildPlugin {
	return createEcoBuildPluginFromSourceTransform(createEcoComponentMetaTransform(options));
}

export default createEcoComponentMetaTransform;
