import type { EcoBuildPlugin } from './build-types.ts';
import { parseSync } from 'oxc-parser';

const RUNTIME_SPECIFIER_ALIAS_MAP = Symbol('ecopages.runtimeSpecifierAliasMap');

type RuntimeSpecifierAliasPlugin = EcoBuildPlugin & {
	[RUNTIME_SPECIFIER_ALIAS_MAP]?: ReadonlyMap<string, string>;
};

export function attachRuntimeSpecifierAliasMap(
	plugin: EcoBuildPlugin,
	specifierMap: ReadonlyMap<string, string>,
): EcoBuildPlugin {
	(plugin as RuntimeSpecifierAliasPlugin)[RUNTIME_SPECIFIER_ALIAS_MAP] = specifierMap;
	return plugin;
}

export function getRuntimeSpecifierAliasMap(plugin: EcoBuildPlugin): ReadonlyMap<string, string> | undefined {
	return (plugin as RuntimeSpecifierAliasPlugin)[RUNTIME_SPECIFIER_ALIAS_MAP];
}

export function collectRuntimeSpecifierAliasMap(plugins: EcoBuildPlugin[] | undefined): ReadonlyMap<string, string> {
	const merged = new Map<string, string>();

	for (const plugin of plugins ?? []) {
		const specifierMap = getRuntimeSpecifierAliasMap(plugin);
		if (!specifierMap) {
			continue;
		}

		for (const [specifier, mappedPath] of specifierMap.entries()) {
			if (!merged.has(specifier)) {
				merged.set(specifier, mappedPath);
			}
		}
	}

	return merged;
}

export function rewriteRuntimeSpecifierAliases(code: string, specifierMap: ReadonlyMap<string, string>): string {
	if (specifierMap.size === 0) {
		return code;
	}

	type Edit = {
		start: number;
		end: number;
		replacement: string;
	};

	const edits: Edit[] = [];

	try {
		const result = parseSync('runtime-alias-output.js', code, {
			sourceType: 'module',
			lang: 'js',
		});

		const queueReplacement = (source: { value?: string; start: number; end: number }) => {
			if (typeof source.value !== 'string') {
				return;
			}

			const mappedPath = specifierMap.get(source.value);
			if (!mappedPath) {
				return;
			}

			const quote = code[source.start] === "'" ? "'" : '"';
			edits.push({
				start: source.start,
				end: source.end,
				replacement: `${quote}${mappedPath}${quote}`,
			});
		};

		const walk = (node: unknown) => {
			if (!node || typeof node !== 'object') {
				return;
			}

			if (Array.isArray(node)) {
				for (const child of node) {
					walk(child);
				}
				return;
			}

			const candidate = node as {
				type?: string;
				source?: { value?: string; start: number; end: number };
			};

			if (
				candidate.type === 'ImportDeclaration' ||
				candidate.type === 'ExportNamedDeclaration' ||
				candidate.type === 'ExportAllDeclaration'
			) {
				if (candidate.source) {
					queueReplacement(candidate.source);
				}
			}

			if (candidate.type === 'ImportExpression') {
				const importNode = candidate as {
					source?: { type?: string; value?: string; start: number; end: number };
				};
				if (importNode.source?.type === 'StringLiteral' || importNode.source?.type === 'Literal') {
					queueReplacement(importNode.source);
				}
			}

			for (const value of Object.values(candidate)) {
				walk(value);
			}
		};

		walk(result.program);
	} catch {
		return code;
	}

	if (edits.length === 0) {
		return code;
	}

	edits.sort((left, right) => right.start - left.start);
	let rewritten = code;
	for (const edit of edits) {
		rewritten = rewritten.slice(0, edit.start) + edit.replacement + rewritten.slice(edit.end);
	}

	return rewritten;
}
