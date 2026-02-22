export type ModuleDependencyDeclaration = {
	from: string;
	imports?: string[];
};

function normalizeImports(imports: string[] | undefined): string[] | undefined {
	if (!imports || imports.length === 0) {
		return undefined;
	}

	const normalized = Array.from(
		new Set(
			imports
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0),
		),
	);

	return normalized.length > 0 ? normalized : undefined;
}

/**
 * Parses a module grammar declaration into normalized object form.
 *
 * Supported input examples:
 * - `react-aria-components`
 * - `react-aria-components{Table,Select}`
 */
export function parseModuleDeclaration(value: string): ModuleDependencyDeclaration {
	const source = value.trim();
	if (source.length === 0) {
		throw new Error('Module declaration cannot be empty');
	}

	const openBraceIndex = source.indexOf('{');
	if (openBraceIndex < 0) {
		return { from: source };
	}

	const closeBraceIndex = source.lastIndexOf('}');
	if (closeBraceIndex !== source.length - 1 || closeBraceIndex <= openBraceIndex) {
		throw new Error(`Invalid module declaration '${value}'`);
	}

	const from = source.slice(0, openBraceIndex).trim();
	if (from.length === 0) {
		throw new Error(`Invalid module declaration '${value}'`);
	}

	const importsSlice = source.slice(openBraceIndex + 1, closeBraceIndex);
	const imports = normalizeImports(importsSlice.split(','));

	return {
		from,
		imports,
	};
}

/**
 * Normalizes and deduplicates module declarations from `modules`.
 *
 * Returns canonical object declarations suitable for downstream bundling logic.
 */
export function normalizeModuleDeclarations(modules?: string[]): ModuleDependencyDeclaration[] {
	const declarations = modules ?? [];

	const output: ModuleDependencyDeclaration[] = [];
	const seen = new Set<string>();

	for (const declaration of declarations) {
		const normalized = parseModuleDeclaration(declaration);
		const key = `${normalized.from}::${(normalized.imports ?? []).join(',')}`;

		if (!seen.has(key)) {
			seen.add(key);
			output.push(normalized);
		}
	}

	return output;
}
