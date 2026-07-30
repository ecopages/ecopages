import path from 'node:path';

export type ClientGraphModuleKind = 'app' | 'workspace' | 'package' | 'vendored' | 'virtual';

export function classifyClientGraphModule(filePath: string, projectRoot?: string): ClientGraphModuleKind {
	if (filePath.startsWith('\0') || filePath.includes('?')) return 'virtual';
	if (filePath.includes('/node_modules/')) return 'package';
	if (filePath.includes('/.eco/') || filePath.includes('/assets/vendors/')) return 'vendored';
	if (projectRoot && filePath.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) return 'app';
	return 'workspace';
}

export function isPageOrLayoutEntry(filePath: string): boolean {
	return /\/(pages|layouts)\//.test(filePath);
}
