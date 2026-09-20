import { repositoryName, withSubpath } from './git-template-source-shared.js';

export function normalizeGithubParts(parts, source) {
	if (parts.length < 2) {
		return null;
	}

	const [owner, repositoryPart, marker, ref, ...subpath] = parts;
	const repository = `${owner}/${repositoryName(repositoryPart)}`;
	if (marker === 'tree' || marker === 'blob') {
		if (!ref) throw new Error(`Template URL '${source}' is missing a Git ref.`);
		return `github:${withSubpath(repository, subpath)}#${ref}`;
	}
	return `github:${repository}`;
}

export function normalizeGitlabParts(parts) {
	const markerIndex = parts.indexOf('-');
	const treeIndex = parts.findIndex((part) => part === 'tree' || part === 'blob');
	if (markerIndex > 0 && treeIndex > markerIndex && parts[treeIndex + 1]) {
		const repository = parts.slice(0, markerIndex).map(repositoryName).join('/');
		const ref = parts[treeIndex + 1];
		const subpath = parts.slice(treeIndex + 2);
		return `gitlab:${withSubpath(repository, subpath)}#${ref}`;
	}
	if (parts.length >= 2) return `gitlab:${parts.join('/')}`;
	return null;
}

export function normalizeBitbucketParts(parts) {
	if (parts.length < 2) {
		return null;
	}

	const [workspace, repositoryPart, marker, ref, ...subpath] = parts;
	const repository = `${workspace}/${repositoryName(repositoryPart)}`;
	if (marker === 'src' && ref) {
		return `bitbucket:${withSubpath(repository, subpath)}#${ref}`;
	}
	return `bitbucket:${repository}`;
}

export function normalizeSourcehutParts(parts) {
	if (parts.length < 2) {
		return null;
	}

	const treeIndex = parts.findIndex((part) => part === 'tree' || part === 'blob');
	if (treeIndex > 1 && parts[treeIndex + 1]) {
		const repository = parts.slice(0, treeIndex).map(repositoryName).join('/');
		const ref = parts[treeIndex + 1];
		const subpath = parts.slice(treeIndex + 2);
		return `sourcehut:${withSubpath(repository, subpath)}#${ref}`;
	}
	return `sourcehut:${parts.join('/')}`;
}
