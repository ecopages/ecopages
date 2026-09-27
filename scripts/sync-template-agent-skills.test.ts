import assert from 'node:assert/strict';
import { test } from 'vitest';
import { rewriteHostedMarkdownLinks } from './sync-template-agent-skills.ts';

test('rewriteHostedMarkdownLinks rewrites site-root skill and llms links', () => {
	const origin = 'https://ecopages.app';
	const markdown = [
		'Read [/llms.txt](/llms.txt) and [/skill.txt](/skill.txt).',
		'Start at [/skill/SKILL.md](/skill/SKILL.md).',
		'Also see [more](/llms.txt) and [the skill](/skill/SKILL.md).',
		'Leave [docs](/docs) and https://example.com/llms.txt alone.',
	].join('\n');

	assert.equal(
		rewriteHostedMarkdownLinks(markdown, origin),
		[
			'Read [llms.txt](https://ecopages.app/llms.txt) and [skill.txt](https://ecopages.app/skill.txt).',
			'Start at [SKILL.md](https://ecopages.app/skill/SKILL.md).',
			'Also see [more](https://ecopages.app/llms.txt) and [the skill](https://ecopages.app/skill/SKILL.md).',
			'Leave [docs](/docs) and https://example.com/llms.txt alone.',
		].join('\n'),
	);
});

test('rewriteHostedMarkdownLinks is a no-op when nothing is site-rooted', () => {
	const markdown = 'See [hosted](https://radiant.ecopages.app/skill/SKILL.md).';
	assert.equal(rewriteHostedMarkdownLinks(markdown, 'https://radiant.ecopages.app'), markdown);
});
