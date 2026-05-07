import { rapidhash } from '../../utils/hash.ts';

export function createModuleScriptName(from: string, imports: string[] | undefined): string {
	const normalizedImports = imports ? [...imports].sort().join(',') : '*';
	const hash = rapidhash(`${from}|${normalizedImports}`).toString(16);
	return `module-${hash}`;
}

export function createNamedImportModuleSource(from: string, imports: string[]): string {
	const namedImports = [...new Set(imports)].sort().join(', ');
	return `export { ${namedImports} } from '${from}';`;
}

export function createNamespaceImportModuleSource(from: string): string {
	return `export * from '${from}';`;
}