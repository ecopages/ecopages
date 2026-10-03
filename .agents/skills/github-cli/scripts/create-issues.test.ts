import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { orderDrafts, parseDraft, readSchema, resolveTokens, type Schema, validateDrafts } from './create-issues.mts';

const SCRIPT = path.join(import.meta.dirname, 'create-issues.mts');

const FORMS = {
	'bug.yml': `name: Bug
type: Bug
body:
  - type: textarea
    attributes:
      label: Problem
    validations:
      required: true
  - type: textarea
    attributes:
      label: Failure scenario
    validations:
      required: true
`,
	'task.yml': `name: Task
type: Task
body:
  - type: textarea
    attributes:
      label: Why
    validations:
      required: true
  - type: textarea
    attributes:
      label: Change
    validations:
      required: true
  - type: textarea
    attributes:
      label: Acceptance
    validations:
      required: true
`,
	'tracking.yml': `name: Tracking
type: Task
labels: [tracking]
body:
  - type: textarea
    attributes:
      label: Goal
    validations:
      required: true
`,
};

const LABELS = `- name: area:build
  color: 1d76db
- name: severity:low
  color: c2e0c6
- name: tracking
  color: 5319e7
`;

let root: string;
let schema: Schema;

beforeAll(() => {
	root = mkdtempSync(path.join(os.tmpdir(), 'create-issues-'));
	mkdirSync(path.join(root, '.github/ISSUE_TEMPLATE'), { recursive: true });
	for (const [file, source] of Object.entries(FORMS)) writeFileSync(path.join(root, '.github/ISSUE_TEMPLATE', file), source);
	writeFileSync(path.join(root, '.github/labels.yml'), LABELS);
	schema = readSchema(root);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function draft(file: string, frontmatter: string, body: string) {
	return parseDraft(file, `---\n${frontmatter}\n---\n${body}`);
}

const task = '### Why\nx\n### Change\ny\n### Acceptance\nz';

test('parseDraft unquotes values and reads inline and block lists', () => {
	const inline = draft('B1.md', 'template: bug\ntitle: "Fix: a"\nlabels: [area:build, severity:low]', '');
	const block = draft('B2.md', 'template: bug\ntitle: B\nlabels:\n  - area:build\n  - severity:low', '');
	expect(inline.title).toBe('Fix: a');
	expect(inline.labels).toEqual(['area:build', 'severity:low']);
	expect(block.labels).toEqual(['area:build', 'severity:low']);
	const flush = draft('B3.md', 'template: task\ntitle: C\nblockedBy:\n- M1\n- M2\nparent: T1', '');
	expect(flush.blockedBy).toEqual(['M1', 'M2']);
	expect(flush.parent).toBe('T1');
});

describe('validateDrafts', () => {
	const known = { drafts: new Set(['T1', 'B1']), created: new Set<string>() };

	test('accepts a draft that follows its form and ignores # lines inside code blocks', () => {
		const valid = draft(
			'B1.md',
			'template: bug\ntitle: A defect\nlabels: [area:build, severity:low]',
			'### Problem\nx\n\n### Failure scenario\n```sh\n# build once\npnpm build\n```',
		);
		expect(validateDrafts([valid], schema, known)).toEqual([]);
	});

	test('accepts a parent created in the same run or already created', () => {
		const tracker = draft('T1.md', 'template: tracking\ntitle: T', '### Goal\nx');
		const change = draft('M1.md', 'template: task\ntitle: M1\nparent: T1', task);
		expect(validateDrafts([tracker, change], schema, { drafts: new Set(['T1', 'M1']), created: new Set() })).toEqual([]);
		expect(validateDrafts([change], schema, { drafts: new Set(['T1', 'M1']), created: new Set(['T1']) })).toEqual([]);
	});

	test('rejects unknown templates, sections, labels and keys, wrong heading levels or order, duplicates and forbidden words', () => {
		const invalid = [
			draft('a.md', 'template: chore\ntitle: A', 'x'),
			draft('b.md', 'template: bug\ntitle: B\nlabels: [area:nowhere]', '### Problem\nx\n### Steps\ny'),
			draft('c.md', 'template: task\ntitle: C\nparent: T9', '## Why\nx\n### Change\ny\n### Acceptance\nz'),
			draft('d.md', 'template: bug\ntitle: ACME thing', '### Problem\nsee .audit/x\n### Failure scenario\ny'),
			draft('e.md', 'template: task\ntitle: E\nparent: T1\nblockedBy: [S0]', `${task}\nsee #{NOPE}`),
			draft('f.md', 'key: e\ntemplate: task', task),
			draft('g.md', 'template: task\ntitle: G', '### Change\ny\n### Why\nx\n### Acceptance\nz'),
		];
		expect(validateDrafts(invalid, schema, known, ['Acme'])).toEqual([
			'a.md: template must be one of bug, task, tracking',
			'b.md: section "Steps" is not in the bug form',
			'b.md: missing required section "Failure scenario"',
			'b.md: label "area:nowhere" is not in .github/labels.yml',
			'c.md: use ### for sections, not ## Why',
			'c.md: missing required section "Why"',
			'c.md: unknown key T9',
			'd.md: links to .audit/, which is not published',
			'd.md: mentions forbidden word "Acme"',
			'e.md: unknown key S0',
			'e.md: unknown key NOPE',
			'e.md: parent T1 is not created yet; pass it too',
			'f.md: duplicate key e',
			'f.md: title is required',
			'g.md: sections are not in the order of the task form',
		]);
	});

	test('reports a blockedBy cycle instead of throwing', () => {
		const loop = [
			draft('A.md', 'template: task\ntitle: A\nblockedBy: [B]', task),
			draft('B.md', 'template: task\ntitle: B\nblockedBy: [A]', task),
		];
		expect(validateDrafts(loop, schema, { drafts: new Set(['A', 'B']), created: new Set() })).toEqual([
			'A.md: parent or blockedBy cycle',
		]);
	});
});

test('readSchema skips config.yml, reads block-style labels, and leaves labels unchecked without labels.yml', () => {
	const bare = mkdtempSync(path.join(os.tmpdir(), 'create-issues-bare-'));
	try {
		mkdirSync(path.join(bare, '.github/ISSUE_TEMPLATE'), { recursive: true });
		writeFileSync(path.join(bare, '.github/ISSUE_TEMPLATE/config.yml'), 'blank_issues_enabled: false\n');
		writeFileSync(
			path.join(bare, '.github/ISSUE_TEMPLATE/idea.yaml'),
			'name: Idea\nlabels:\n  - enhancement\nbody:\n  - type: textarea\n    attributes:\n      label: Pitch\n',
		);
		const local = readSchema(bare);
		expect([...local.forms.keys()]).toEqual(['idea']);
		expect(local.forms.get('idea')?.labels).toEqual(['enhancement']);
		const idea = draft('I1.md', 'template: idea\ntitle: I\nlabels: [anything]', '### Pitch\nx');
		expect(validateDrafts([idea], local, { drafts: new Set(['I1']), created: new Set() })).toEqual([]);
	} finally {
		rmSync(bare, { recursive: true, force: true });
	}
});

test('orderDrafts puts parents and blockers first', () => {
	const tracker = draft('T1.md', 'template: tracking\ntitle: T', '');
	const first = draft('M2.md', 'template: task\ntitle: M2\nparent: T1', '');
	const second = draft('M10.md', 'template: task\ntitle: M10\nparent: T1\nblockedBy: [M2]', '');
	expect(orderDrafts([second, first, tracker]).map((item) => item.key)).toEqual(['T1', 'M2', 'M10']);
});

test('resolveTokens fills created issues and leaves the rest for a later run', () => {
	const manifest = { M2: { number: 120, id: 1, url: '' } };
	expect(resolveTokens('Fixed by #{M2}; see #{M9}.', manifest)).toBe('Fixed by #120; see #{M9}.');
});

/**
 * @remarks
 * Runs the CLI with a fake `gh` first on `PATH` that logs each call and answers like the GitHub API, so the
 * test asserts what crossed the process boundary.
 */
test('--apply creates issues in order, links them, and a second run creates nothing', () => {
	const work = mkdtempSync(path.join(os.tmpdir(), 'create-issues-apply-'));
	try {
		const bin = path.join(work, 'bin');
		const log = path.join(work, 'gh.log');
		mkdirSync(bin);
		writeFileSync(
			path.join(bin, 'gh'),
			`#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const input = args.includes('--input') ? fs.readFileSync(0, 'utf8') : undefined;
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, input: input && JSON.parse(input) }) + '\\n');
const endpoint = args.find((arg) => arg.startsWith('repos/')) ?? '';
if (args.includes('--paginate')) process.stdout.write('[[]]');
else if (endpoint.endsWith('/milestones')) process.stdout.write('{"number":7}');
else if (endpoint.endsWith('/issues')) {
	const count = fs.readFileSync(${JSON.stringify(log)}, 'utf8').split('"POST","repos/o/r/issues"').length - 1;
	process.stdout.write(JSON.stringify({ number: count, id: 100 + count, html_url: 'u' }));
}
`,
		);
		chmodSync(path.join(bin, 'gh'), 0o755);

		const repo = path.join(work, 'repo');
		const drafts = path.join(work, 'drafts');
		mkdirSync(path.join(repo, '.github'), { recursive: true });
		execFileSync('cp', ['-R', path.join(root, '.github/'), path.join(repo, '.github')]);
		execFileSync('git', ['init', '-q'], { cwd: repo });
		mkdirSync(drafts);
		writeFileSync(path.join(drafts, 'T1.md'), '---\ntemplate: tracking\ntitle: T\nmilestone: 1.x\n---\n### Goal\nx');
		writeFileSync(path.join(drafts, 'M1.md'), `---\ntemplate: task\ntitle: M1\nparent: T1\n---\n${task}\nthen #{M2}`);
		writeFileSync(path.join(drafts, 'M2.md'), `---\ntemplate: task\ntitle: M2\nparent: T1\nblockedBy: [M1]\n---\n${task}`);

		const run = () =>
			execFileSync(process.execPath, ['--experimental-strip-types', SCRIPT, drafts, '--apply', '--repo', 'o/r'], {
				cwd: repo,
				env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, INIT_CWD: repo },
				stdio: 'pipe',
			});
		const calls = () =>
			readFileSync(log, 'utf8')
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line) as { args: string[]; input?: Record<string, unknown> });

		run();
		const first = calls();
		const created = first.filter((call) => call.args.includes('repos/o/r/issues')).map((call) => call.input);
		expect(created.map((issue) => [issue?.title, issue?.labels, issue?.milestone, issue?.parent_issue_id])).toEqual([
			['T', ['tracking'], 7, undefined],
			['M1', [], undefined, 101],
			['M2', [], undefined, 101],
		]);
		expect(first.filter((call) => call.args.includes('PATCH')).map((call) => call.input?.body)).toEqual([`${task}\nthen #3`]);
		expect(first.filter((call) => call.args[0] === 'issue').map((call) => call.args.slice(1))).toEqual([
			['edit', '3', '--repo', 'o/r', '--add-blocked-by', '2'],
		]);
		expect(Object.keys(JSON.parse(readFileSync(path.join(drafts, 'manifest.json'), 'utf8')))).toEqual(['T1', 'M1', 'M2']);

		run();
		const second = calls().slice(first.length);
		expect(second.filter((call) => !call.args.includes('--paginate'))).toEqual([]);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
});
