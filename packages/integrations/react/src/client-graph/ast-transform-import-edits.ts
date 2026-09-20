/**
 * Builds source edits for import declaration specifier pruning.
 */

export type SourceEdit = { start: number; end: number; replacement: string };

/**
 * Applies range replacements from last-to-first so earlier offsets stay valid.
 */
export function applySourceEdits(source: string, edits: SourceEdit[]): string {
	edits.sort((a, b) => b.start - a.start);
	let transformed = source;
	for (const edit of edits) {
		transformed = transformed.slice(0, edit.start) + edit.replacement + transformed.slice(edit.end);
	}
	return transformed;
}

/**
 * Rewrites an import declaration when only a subset of specifiers is allowed.
 */
type KeptImportSpecifiers = {
	keptSpecifierCount: number;
	defaultImportLocal?: string;
	namespaceImportLocal?: string;
	namedImportNodes: string[];
};

function collectKeptImportSpecifiers(node: any, rules: Set<string>): KeptImportSpecifiers {
	const kept: KeptImportSpecifiers = { keptSpecifierCount: 0, namedImportNodes: [] };
	for (const spec of node.specifiers) {
		if (spec.type === 'ImportSpecifier') {
			appendKeptNamedSpecifier(spec, rules, kept);
		} else if (spec.type === 'ImportDefaultSpecifier') {
			appendKeptDefaultSpecifier(spec, rules, kept);
		} else if (spec.type === 'ImportNamespaceSpecifier') {
			appendKeptNamespaceSpecifier(spec, rules, kept);
		}
	}
	return kept;
}

function appendKeptNamedSpecifier(spec: any, rules: Set<string>, kept: KeptImportSpecifiers): void {
	const importedName = spec.imported.type === 'Identifier' ? spec.imported.name : (spec.imported.value as string);
	if (!rules.has(importedName)) return;
	kept.keptSpecifierCount += 1;
	const localName = spec.local?.name;
	kept.namedImportNodes.push(
		localName && localName !== importedName ? `${importedName} as ${localName}` : importedName,
	);
}

function appendKeptDefaultSpecifier(spec: any, rules: Set<string>, kept: KeptImportSpecifiers): void {
	if (!rules.has('default')) return;
	kept.keptSpecifierCount += 1;
	kept.defaultImportLocal = spec.local.name;
}

function appendKeptNamespaceSpecifier(spec: any, rules: Set<string>, kept: KeptImportSpecifiers): void {
	if (!rules.has('*')) return;
	kept.keptSpecifierCount += 1;
	kept.namespaceImportLocal = spec.local.name;
}

export function buildImportDeclarationRewrite(
	node: any,
	specifier: string,
	rules: Set<string>,
): SourceEdit | undefined {
	const { keptSpecifierCount, defaultImportLocal, namespaceImportLocal, namedImportNodes } =
		collectKeptImportSpecifiers(node, rules);

	if (keptSpecifierCount === 0) {
		return { start: node.start, end: node.end, replacement: '' };
	}
	if (keptSpecifierCount >= node.specifiers.length) {
		return undefined;
	}

	const newDeclaration = formatPrunedImportDeclaration(
		specifier,
		defaultImportLocal,
		namespaceImportLocal,
		namedImportNodes,
	);
	return { start: node.start, end: node.end, replacement: newDeclaration };
}

function formatPrunedImportDeclaration(
	specifier: string,
	defaultImportLocal: string | undefined,
	namespaceImportLocal: string | undefined,
	namedImportNodes: string[],
): string {
	if (defaultImportLocal && namespaceImportLocal) {
		return `import ${defaultImportLocal}, * as ${namespaceImportLocal} from '${specifier}';`;
	}
	if (namespaceImportLocal) {
		return `import * as ${namespaceImportLocal} from '${specifier}';`;
	}
	if (defaultImportLocal && namedImportNodes.length > 0) {
		return `import ${defaultImportLocal}, { ${namedImportNodes.join(', ')} } from '${specifier}';`;
	}
	if (defaultImportLocal) {
		return `import ${defaultImportLocal} from '${specifier}';`;
	}
	return `import { ${namedImportNodes.join(', ')} } from '${specifier}';`;
}
