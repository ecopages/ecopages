import { fileSystem } from '@ecopages/file-system';

export async function getReactServerMetadataSummary() {
	const matches = await fileSystem.glob(['react*.tsx', 'react*.mdx', 'react-server-files/**/*.tsx'], {
		cwd: import.meta.dirname,
	});

	return {
		routeCount: matches.length,
		scannedDir: 'src/pages',
	};
}
