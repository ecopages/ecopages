import type { ModuleType, RolldownPlugin } from 'rolldown';
import { fileSystem } from '@ecopages/file-system';
import { path } from '@ecopages/file-system/path';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';
import { fromRolldownModuleId } from './rolldown-module-id.ts';

const SSR_SCRIPT_PATTERN = /\bssr\s*:\s*(?:true|!0)/u;

const PARSER_LANGUAGES = ['js', 'jsx', 'ts', 'tsx'] as const;

type AstNode = Record<string, unknown>;

function isNode(value: unknown): value is AstNode {
	return typeof value === 'object' && value !== null;
}

function propertyValue(object: AstNode, name: string): unknown {
	for (const property of Array.isArray(object.properties) ? object.properties : []) {
		if (!isNode(property) || (property.type !== 'ObjectProperty' && property.type !== 'Property')) continue;
		const key = property.key;
		if (isNode(key) && (key.name === name || key.value === name)) return property.value;
	}
	return undefined;
}

function findSsrScriptSources(value: unknown, sources: string[]): void {
	if (Array.isArray(value)) {
		for (const child of value) findSsrScriptSources(child, sources);
		return;
	}
	if (!isNode(value)) return;
	if (value.type === 'ObjectExpression') {
		const src = propertyValue(value, 'src');
		const ssr = propertyValue(value, 'ssr');
		if (isNode(src) && typeof src.value === 'string' && isNode(ssr) && ssr.value === true) sources.push(src.value);
	}
	for (const [key, child] of Object.entries(value)) {
		if (key !== 'type' && typeof child === 'object') findSsrScriptSources(child, sources);
	}
}

/**
 * Emits each `ssr: true` script a declaration lists as an entry of the server build that bundles the declaration.
 *
 * @remarks
 * A custom element script that the server also evaluates is not imported by the component that lists it, so only
 * the declaration names it: `dependencies.scripts: [{ src: './x.script.ts', ssr: true }]`, with `src` relative to the
 * declaring module. The script then shares chunks with the rest of the build and keeps its exports like any
 * entry, so no second build is needed to add it. Only a literal `src` beside a literal `ssr: true` is found; a
 * script path computed at runtime is not.
 */
export function createSsrScriptEntriesPlugin(): RolldownPlugin {
	return {
		name: 'ecopages:ssr-script-entries',
		transform: {
			filter: { code: SSR_SCRIPT_PATTERN },
			handler(code, id, meta) {
				const file = fromRolldownModuleId(id);
				const lang = PARSER_LANGUAGES.find((language) => language === (meta.moduleType as ModuleType)) ?? 'js';
				const sources: string[] = [];
				findSsrScriptSources(parseModuleSource(file, code, { sourceType: 'module', lang }).program, sources);
				for (const src of sources) {
					const script = path.resolve(path.dirname(file), src);
					if (fileSystem.exists(script)) this.emitFile({ type: 'chunk', id: script });
				}
				return null;
			},
		},
	};
}
