import assert from 'node:assert/strict';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';
import { linkSkills } from './link-agent-skills.ts';

let root: string;

function setup(): { sourceDir: string; targetDir: string } {
	root = mkdtempSync(path.join(os.tmpdir(), 'link-agent-skills-'));
	const sourceDir = path.join(root, '.agents/skills');
	for (const [name, metadata, body] of [
		['review', '', ''],
		['commit', '', 'An example frontmatter:\n\n  scope: project\n'],
		['repo', 'metadata:\n  scope: project\n', ''],
	]) {
		mkdirSync(path.join(sourceDir, name), { recursive: true });
		writeFileSync(path.join(sourceDir, name, 'SKILL.md'), `---\nname: ${name}\n${metadata}---\n${body}`);
	}
	mkdirSync(path.join(sourceDir, 'not-a-skill'));
	return { sourceDir, targetDir: path.join(root, '.claude/skills') };
}

afterEach(() => rmSync(root, { recursive: true, force: true }));

test('links each skill relatively, keeps an existing directory, and a second run changes nothing', () => {
	const { sourceDir, targetDir } = setup();
	mkdirSync(path.join(targetDir, 'commit'), { recursive: true });

	const first = linkSkills(sourceDir, targetDir, root);
	assert.deepEqual(first.linked, [path.join(targetDir, 'repo'), path.join(targetDir, 'review')]);
	assert.deepEqual(first.skipped, [path.join(targetDir, 'commit')]);
	assert.equal(readlinkSync(path.join(targetDir, 'review')), path.join('..', '..', '.agents/skills/review'));
	assert.deepEqual(linkSkills(sourceDir, targetDir, root), first);
});

test('prunes links to removed skills and leaves other dangling links alone', () => {
	const { sourceDir, targetDir } = setup();
	linkSkills(sourceDir, targetDir, root);
	symlinkSync(path.join(root, 'personal/gone'), path.join(targetDir, 'gone'), 'dir');

	rmSync(path.join(sourceDir, 'review'), { recursive: true });
	assert.deepEqual(linkSkills(sourceDir, targetDir, root).pruned, [path.join(targetDir, 'review')]);
	assert.ok(lstatSync(path.join(targetDir, 'gone')).isSymbolicLink());
});

test('links outside the repository are absolute and leave out skills whose frontmatter is project-scoped', () => {
	const { sourceDir } = setup();
	const outside = mkdtempSync(path.join(os.tmpdir(), 'link-agent-skills-home-'));
	try {
		const result = linkSkills(sourceDir, outside, root);
		assert.equal(readlinkSync(path.join(outside, 'review')), path.join(sourceDir, 'review'));
		assert.equal(result.linked.length, 2);
		assert.equal(existsSync(path.join(outside, 'repo')), false);
	} finally {
		rmSync(outside, { recursive: true, force: true });
	}
});

test('a link to another source with the same name is left alone', () => {
	const { sourceDir, targetDir } = setup();
	const other = path.join(root, 'personal/review');
	mkdirSync(other, { recursive: true });
	mkdirSync(targetDir, { recursive: true });
	symlinkSync(other, path.join(targetDir, 'review'), 'dir');

	const result = linkSkills(sourceDir, targetDir, root);
	assert.deepEqual(result.skipped, [path.join(targetDir, 'review')]);
	assert.equal(readlinkSync(path.join(targetDir, 'review')), other);
});
