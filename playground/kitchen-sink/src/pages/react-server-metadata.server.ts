import { fileSystem } from '@ecopages/file-system';

export async function getReactServerMetadataSummary(pagesDir: string) {
	const matches = await fileSystem.glob(['react*.tsx', 'react*.mdx', 'react-server-files/**/*.tsx'], {
		cwd: pagesDir,
	});

	return {
		routeCount: matches.length,
		scannedDir: 'src/pages',
	};
}
