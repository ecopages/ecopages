import { describe, expect, it } from 'vitest';
import { normalizeGitSource } from './git-template-source.js';

describe('normalizeGitSource', () => {
	it.each([
		['giget provider sources unchanged', 'github:owner/repo#v1.0.0', 'github:owner/repo#v1.0.0'],
		[
			'GitHub tree URLs with a subpath',
			'https://github.com/custom/template/tree/main/site',
			'github:custom/template/site#main',
		],
		['GitLab tree URLs', 'https://gitlab.com/group/project/-/tree/main/app', 'gitlab:group/project/app#main'],
		['Bitbucket src URLs', 'https://bitbucket.org/team/repo/src/main/site', 'bitbucket:team/repo/site#main'],
		[
			'SourceHut tree URLs with a subpath',
			'https://git.sr.ht/~owner/repo/tree/main/site',
			'sourcehut:~owner/repo/site#main',
		],
	])('normalizes %s', (_name, source, expected) => {
		expect(normalizeGitSource(source)).toBe(expected);
	});

	it.each([
		['hosts it does not support', 'https://example.com/owner/repo', 'Unsupported template host'],
		['SourceHut URLs without a repository', 'https://git.sr.ht/~owner', 'Unsupported template URL'],
		['GitHub URLs without a repository', 'https://github.com/owner', 'Unsupported template URL'],
	])('rejects %s', (_name, source, message) => {
		expect(() => normalizeGitSource(source)).toThrow(message);
	});
});
