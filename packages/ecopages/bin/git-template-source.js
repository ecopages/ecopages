const GIT_PROVIDER_PREFIX = /^(github|gitlab|bitbucket|sourcehut):/u;

const HOST_PROVIDER = {
	'github.com': 'github',
	'gitlab.com': 'gitlab',
	'bitbucket.org': 'bitbucket',
	'git.sr.ht': 'sourcehut',
};

function repositoryName(value) {
	return value.replace(/\.git$/u, '');
}

function withSubpath(repository, subpath) {
	return subpath.length > 0 ? `${repository}/${subpath.join('/')}` : repository;
}

/**
 * Normalizes a Git provider URL or giget source into a giget template source.
 */
export function normalizeGitSource(source) {
	if (GIT_PROVIDER_PREFIX.test(source)) {
		return source;
	}

	let url;
	try {
		url = new URL(source);
	} catch {
		throw new Error(`Unsupported template source '${source}'. Use a Git provider URL or giget source.`);
	}

	const hostProvider = HOST_PROVIDER[url.hostname];
	if (!hostProvider) {
		throw new Error(
			`Unsupported template host '${url.hostname}'. Supported hosts are GitHub, GitLab, Bitbucket, and SourceHut.`,
		);
	}

	const parts = url.pathname
		.replace(/^\/+|\/+$/gu, '')
		.split('/')
		.filter(Boolean);

	if (hostProvider === 'github' && parts.length >= 2) {
		const [owner, repositoryPart, marker, ref, ...subpath] = parts;
		const repository = `${owner}/${repositoryName(repositoryPart)}`;
		if (marker === 'tree' || marker === 'blob') {
			if (!ref) throw new Error(`Template URL '${source}' is missing a Git ref.`);
			return `github:${withSubpath(repository, subpath)}#${ref}`;
		}
		return `github:${repository}`;
	}

	if (hostProvider === 'gitlab') {
		const markerIndex = parts.indexOf('-');
		const treeIndex = parts.findIndex((part) => part === 'tree' || part === 'blob');
		if (markerIndex > 0 && treeIndex > markerIndex && parts[treeIndex + 1]) {
			const repository = parts.slice(0, markerIndex).map(repositoryName).join('/');
			const ref = parts[treeIndex + 1];
			const subpath = parts.slice(treeIndex + 2);
			return `gitlab:${withSubpath(repository, subpath)}#${ref}`;
		}
		if (parts.length >= 2) return `gitlab:${parts.join('/')}`;
	}

	if (hostProvider === 'bitbucket' && parts.length >= 2) {
		const [workspace, repositoryPart, marker, ref, ...subpath] = parts;
		const repository = `${workspace}/${repositoryName(repositoryPart)}`;
		if (marker === 'src' && ref) {
			return `bitbucket:${withSubpath(repository, subpath)}#${ref}`;
		}
		return `bitbucket:${repository}`;
	}

	if (hostProvider === 'sourcehut' && parts.length >= 2) {
		const treeIndex = parts.findIndex((part) => part === 'tree' || part === 'blob');
		if (treeIndex > 1 && parts[treeIndex + 1]) {
			const repository = parts.slice(0, treeIndex).map(repositoryName).join('/');
			const ref = parts[treeIndex + 1];
			const subpath = parts.slice(treeIndex + 2);
			return `sourcehut:${withSubpath(repository, subpath)}#${ref}`;
		}
		return `sourcehut:${parts.join('/')}`;
	}

	throw new Error(`Unsupported template URL '${source}'. Include a repository and optional Git ref.`);
}
