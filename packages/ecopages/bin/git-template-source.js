import {
	normalizeBitbucketParts,
	normalizeGithubParts,
	normalizeGitlabParts,
	normalizeSourcehutParts,
} from './git-template-source-providers.js';

const GIT_PROVIDER_PREFIX = /^(github|gitlab|bitbucket|sourcehut):/u;

const HOST_PROVIDER = {
	'github.com': 'github',
	'gitlab.com': 'gitlab',
	'bitbucket.org': 'bitbucket',
	'git.sr.ht': 'sourcehut',
};

const PROVIDER_NORMALIZERS = {
	github: normalizeGithubParts,
	gitlab: normalizeGitlabParts,
	bitbucket: normalizeBitbucketParts,
	sourcehut: normalizeSourcehutParts,
};

function normalizeProviderUrl(hostProvider, parts, source) {
	const normalize = PROVIDER_NORMALIZERS[hostProvider];
	const normalized = normalize?.(parts, source);
	if (normalized) {
		return normalized;
	}

	throw new Error(`Unsupported template URL '${source}'. Include a repository and optional Git ref.`);
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

	return normalizeProviderUrl(hostProvider, parts, source);
}
