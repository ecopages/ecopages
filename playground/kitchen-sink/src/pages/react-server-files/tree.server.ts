import { join } from 'node:path';
import { fileSystem } from '@ecopages/file-system';

export type PagesTreeSnapshot = {
	scannedDir: string;
	fileCount: number;
	routeFiles: string[];
	tree: string;
};

type TreeNode = {
	kind: 'directory' | 'file';
	children?: Map<string, TreeNode>;
};

function createDirectoryNode(): TreeNode {
	return {
		kind: 'directory',
		children: new Map(),
	};
}

function insertPath(root: TreeNode, path: string) {
	const parts = path.split('/').filter(Boolean);
	let current = root;

	for (const [index, part] of parts.entries()) {
		if (!current.children) {
			current.children = new Map();
		}

		const isLeaf = index === parts.length - 1;
		const existing = current.children.get(part);

		if (existing) {
			current = existing;
			continue;
		}

		const nextNode = isLeaf ? { kind: 'file' as const } : createDirectoryNode();
		current.children.set(part, nextNode);
		current = nextNode;
	}
}

function sortEntries(entries: [string, TreeNode][]) {
	return entries.sort(([leftName, leftNode], [rightName, rightNode]) => {
		if (leftNode.kind !== rightNode.kind) {
			return leftNode.kind === 'directory' ? -1 : 1;
		}

		return leftName.localeCompare(rightName);
	});
}

function renderTreeEntries(node: TreeNode, prefix = ''): string[] {
	if (!node.children || node.children.size === 0) {
		return [];
	}

	const entries = sortEntries(Array.from(node.children.entries()));

	return entries.flatMap(([name, child], index) => {
		const isLast = index === entries.length - 1;
		const branch = `${prefix}${isLast ? '\\--' : '|--'} ${name}`;

		if (child.kind === 'file') {
			return [branch];
		}

		const nextPrefix = `${prefix}${isLast ? '    ' : '|   '}`;
		return [branch, ...renderTreeEntries(child, nextPrefix)];
	});
}

function buildTree(paths: string[], rootLabel: string) {
	const root = createDirectoryNode();

	for (const path of paths) {
		insertPath(root, path);
	}

	return [rootLabel, ...renderTreeEntries(root)].join('\n');
}

export async function buildPagesTreeSnapshot(): Promise<PagesTreeSnapshot> {
	const pagesDir = join(import.meta.dirname, '..');
	const scannedDir = 'src/pages';
	const files = (
		await fileSystem.glob(['**/*.ts', '**/*.tsx', '**/*.md', '**/*.mdx', '**/*.css'], {
			cwd: pagesDir,
		})
	)
		.map((path) => path.replaceAll('\\', '/'))
		.sort((left, right) => left.localeCompare(right));

	return {
		scannedDir,
		fileCount: files.length,
		routeFiles: files.filter((path) => path.startsWith('react-server-files/')),
		tree: buildTree(files, scannedDir),
	};
}
