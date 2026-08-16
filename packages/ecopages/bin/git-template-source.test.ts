import { describe, expect, it } from 'vitest';
import { normalizeGitSource } from './git-template-source.js';

describe('normalizeGitSource', () => {
	it('passes through giget provider sources', () => {
		expect(normalizeGitSource('github:owner/repo#v1.0.0')).toBe('github:owner/repo#v1.0.0');
	});

	it('normalizes GitHub tree URLs with a subpath', () => {
		expect(normalizeGitSource('https://github.com/custom/template/tree/main/site')).toBe(
			'github:custom/template/site#main',
		);
	});

	it('normalizes GitLab tree URLs', () => {
		expect(normalizeGitSource('https://gitlab.com/group/project/-/tree/main/app')).toBe(
			'gitlab:group/project/app#main',
		);
	});

	it('normalizes Bitbucket src URLs', () => {
		expect(normalizeGitSource('https://bitbucket.org/team/repo/src/main/site')).toBe(
			'bitbucket:team/repo/site#main',
		);
	});

	it('rejects unsupported hosts', () => {
		expect(() => normalizeGitSource('https://example.com/owner/repo')).toThrow('Unsupported template host');
	});
});
