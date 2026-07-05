const FENCED_CODE = /^```[\s\S]*?^```/gm;
const SPREAD_IDENTIFIER = /\{\.\.\.(\w+)\}/g;

function stripFencedCode(source: string): string {
	return source.replace(FENCED_CODE, '');
}

/**
 * Collects `{...Identifier}` spread names from live MDX, excluding fenced code blocks.
 */
export function collectMdxSpreadIdentifiers(source: string): string[] {
	const withoutFences = stripFencedCode(source);
	const identifiers = new Set<string>();

	for (const match of withoutFences.matchAll(SPREAD_IDENTIFIER)) {
		identifiers.add(match[1]!);
	}

	return [...identifiers];
}

/**
 * Prepends image virtual-module imports required by live JSX spread expressions.
 */
export function prependMdxImageImports(source: string, images: Record<string, unknown>, importUrl: string): string {
	const identifiers = collectMdxSpreadIdentifiers(source).filter((identifier) => identifier in images);

	if (identifiers.length === 0) {
		return source;
	}

	return `import { ${identifiers.join(', ')} } from '${importUrl}'\n\n${source}`;
}
