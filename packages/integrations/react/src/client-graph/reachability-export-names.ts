export type ExplicitlyRequestedExports = Set<string> | '*';

export function isExplicitlyRequestedExport(
	name: string,
	explicitlyRequestedExports?: ExplicitlyRequestedExports,
): boolean {
	if (explicitlyRequestedExports === '*') return true;
	return explicitlyRequestedExports?.has(name) ?? false;
}

export function getExportedName(specifier: any): string | undefined {
	if (specifier?.exported?.type === 'Identifier') return specifier.exported.name;
	if (typeof specifier?.exported?.value === 'string') return specifier.exported.value;
	if (specifier?.local?.type === 'Identifier') return specifier.local.name;
	if (typeof specifier?.local?.value === 'string') return specifier.local.value;
	return undefined;
}

export function getReexportedImportName(specifier: any): string | undefined {
	if (specifier?.local?.type === 'Identifier') return specifier.local.name;
	if (typeof specifier?.local?.value === 'string') return specifier.local.value;
	if (specifier?.imported?.type === 'Identifier') return specifier.imported.name;
	if (typeof specifier?.imported?.value === 'string') return specifier.imported.value;
	return getExportedName(specifier);
}

export function getLocalExportName(specifier: any): string | undefined {
	if (specifier?.local?.type === 'Identifier') return specifier.local.name;
	if (typeof specifier?.local?.value === 'string') return specifier.local.value;
	return undefined;
}
