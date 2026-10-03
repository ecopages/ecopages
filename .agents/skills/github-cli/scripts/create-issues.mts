/**
 * Validates issue drafts against the repository's issue forms and labels and, with `--apply`, creates and
 * links them on GitHub.
 *
 * Usage: node --experimental-strip-types create-issues.mts <file.md | folder> [more files] [--repo owner/name] [--forbid a,b] [--apply]
 *
 * Run it from inside the target repository. Format: ../references/issues.md. Schema: `.github/ISSUE_TEMPLATE/*.yml`
 * and, when present, `.github/labels.yml`. `--apply` needs an authenticated `gh` CLI.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

type IssueForm = {
	type: string;
	labels: string[];
	fields: Array<{ label: string; required: boolean }>;
};

type Label = { name: string; color: string; description: string };

export type Draft = {
	file: string;
	key: string;
	template: string;
	title: string;
	labels: string[];
	milestone?: string;
	parent?: string;
	blockedBy: string[];
	body: string;
};

/**
 * @remarks
 * `labels` is undefined when the repository has no `.github/labels.yml`. Labels are then not validated.
 */
export type Schema = { forms: Map<string, IssueForm>; labels?: Map<string, Label> };

/**
 * Draft keys a reference may point at: `drafts` are the drafts in the folder, `created` the keys already in
 * `manifest.json`.
 */
export type KnownKeys = { drafts: Set<string>; created: Set<string> };

type ManifestEntry = {
	number: number;
	id: number;
	url: string;
	bodyResolved?: boolean;
	blockedByLinked?: string[];
};

type Manifest = Record<string, ManifestEntry>;

const KEY_TOKEN = /#\{([A-Za-z0-9_-]+)\}/g;
const FENCED_BLOCK = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm;
const USAGE = 'Usage: create-issues.mts <file.md | folder> [more files] [--repo owner/name] [--forbid a,b] [--apply]';

function unquote(value: string): string {
	return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

function parseList(value: string): string[] {
	return value
		.trim()
		.replace(/^\[/, '')
		.replace(/\]$/, '')
		.split(',')
		.map(unquote)
		.filter(Boolean);
}

function topLevelValue(source: string, key: string): string | undefined {
	return new RegExp(`^${key}:[ \\t]*(\\S.*)$`, 'm').exec(source)?.[1];
}

/**
 * @remarks
 * Reads an inline list (`key: [a, b]` or `key: a, b`) or a block list (`key:` followed by `- a` lines).
 */
function listValue(source: string, key: string): string[] {
	const inline = topLevelValue(source, key);
	if (inline !== undefined) return parseList(inline);
	const block = new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]*-.*(?:\\n|$))+)`, 'm').exec(source)?.[1] ?? '';
	return block
		.split('\n')
		.map((line) => unquote(line.replace(/^\s*-\s*/, '')))
		.filter(Boolean);
}

/**
 * @remarks
 * Only the keys this script relies on are parsed: `type`, `labels`, and each body field's `label` and
 * `validations.required`.
 */
function parseIssueForm(source: string): IssueForm {
	const [header, body = ''] = source.split(/^body:\s*$/m);
	const fields = body
		.split(/^\s*- type:/m)
		.slice(1)
		.map((item) => ({
			label: unquote(/^\s*label:[ \t]*(.+)$/m.exec(item)?.[1] ?? ''),
			required: /^\s*required:[ \t]*true\s*$/m.test(item),
		}))
		.filter((field) => field.label);
	return {
		type: unquote(topLevelValue(header, 'type') ?? ''),
		labels: listValue(header, 'labels'),
		fields,
	};
}

function parseLabels(source: string): Label[] {
	return source
		.split(/^- name:/m)
		.slice(1)
		.map((entry) => ({
			name: unquote(entry.split('\n')[0]),
			color: unquote(/^\s*color:[ \t]*(.+)$/m.exec(entry)?.[1] ?? 'ededed'),
			description: unquote(/^\s*description:[ \t]*(.+)$/m.exec(entry)?.[1] ?? ''),
		}));
}

/**
 * Reads the issue forms and labels of the repository at `root`.
 *
 * @remarks
 * A form is any `.yml` or `.yaml` in `.github/ISSUE_TEMPLATE/` except `config.yml`; its file name is the
 * draft's `template`.
 */
export function readSchema(root: string): Schema {
	const formsDir = path.join(root, '.github/ISSUE_TEMPLATE');
	if (!existsSync(formsDir)) throw new Error(`No issue forms in ${formsDir}. Drafts are validated against them.`);
	const forms = new Map(
		readdirSync(formsDir)
			.filter((file) => /\.ya?ml$/.test(file) && !/^config\.ya?ml$/.test(file))
			.map((file) => [file.replace(/\.ya?ml$/, ''), parseIssueForm(readFileSync(path.join(formsDir, file), 'utf8'))]),
	);
	const labelsFile = path.join(root, '.github/labels.yml');
	const labels = existsSync(labelsFile)
		? new Map(parseLabels(readFileSync(labelsFile, 'utf8')).map((label) => [label.name, label]))
		: undefined;
	return { forms, labels };
}

/**
 * @remarks
 * Frontmatter values are plain or quoted strings, and lists are inline (`[a, b]`) or block (`- a`). `key`
 * defaults to the file name.
 */
export function parseDraft(file: string, source: string): Draft {
	const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
	if (!match) throw new Error(`${file}: missing frontmatter`);
	const [, frontmatter, body] = match;
	const value = (key: string) => unquote(topLevelValue(frontmatter, key) ?? '') || undefined;
	return {
		file,
		key: value('key') ?? path.basename(file, '.md'),
		template: value('template') ?? '',
		title: value('title') ?? '',
		labels: listValue(frontmatter, 'labels'),
		milestone: value('milestone'),
		parent: value('parent'),
		blockedBy: listValue(frontmatter, 'blockedBy'),
		body: body.trim(),
	};
}

function sectionErrors(draft: Draft, form: IssueForm): string[] {
	const errors: string[] = [];
	const headings = Array.from(draft.body.replace(FENCED_BLOCK, '').matchAll(/^(#{1,6}) (.+)$/gm), ([, hashes, text]) => ({
		level: hashes.length,
		text: text.trim(),
	}));
	const allowed = new Set(form.fields.map((field) => field.label));
	for (const heading of headings) {
		if (heading.level !== 3) errors.push(`use ### for sections, not ${'#'.repeat(heading.level)} ${heading.text}`);
		else if (!allowed.has(heading.text)) errors.push(`section "${heading.text}" is not in the ${draft.template} form`);
	}
	const sections = headings.filter((heading) => heading.level === 3 && allowed.has(heading.text));
	const order = sections.map((heading) => form.fields.findIndex((field) => field.label === heading.text));
	if (order.some((index, position) => position > 0 && index < order[position - 1])) {
		errors.push(`sections are not in the order of the ${draft.template} form`);
	}
	const present = new Set(sections.map((heading) => heading.text));
	for (const field of form.fields) {
		if (field.required && !present.has(field.label)) errors.push(`missing required section "${field.label}"`);
	}
	return errors;
}

function referenceErrors(draft: Draft, known: KnownKeys, selected: Set<string>): string[] {
	const references = [
		...(draft.parent ? [draft.parent] : []),
		...draft.blockedBy,
		...Array.from(draft.body.matchAll(KEY_TOKEN), (token) => token[1]),
	];
	const errors = references
		.filter((key) => !known.drafts.has(key) && !known.created.has(key))
		.map((key) => `unknown key ${key}`);
	if (draft.parent === draft.key) errors.push('an issue cannot be its own parent');
	else if (draft.parent && known.drafts.has(draft.parent) && !selected.has(draft.parent) && !known.created.has(draft.parent)) {
		errors.push(`parent ${draft.parent} is not created yet; pass it too`);
	}
	return errors;
}

function contentErrors(draft: Draft, forbidden: string[]): string[] {
	const errors: string[] = [];
	if (draft.body.includes('.audit/')) errors.push('links to .audit/, which is not published');
	const text = `${draft.title}\n${draft.body}`.toLowerCase();
	for (const word of forbidden) {
		if (text.includes(word.toLowerCase())) errors.push(`mentions forbidden word "${word}"`);
	}
	return errors;
}

/**
 * Returns every problem in `drafts`, each prefixed with its file name.
 *
 * @remarks
 * A draft must name a form in `template`, use only `###` section headings that form defines, in its order
 * (headings inside fenced code blocks are ignored), include every required one, and use only labels from `.github/labels.yml`
 * when that file exists. `blockedBy` and `#{KEY}` may point at any draft in the folder or a created issue; a
 * `parent` must be created already or be among `drafts`, because GitHub needs it at creation. Any mention of
 * `.audit/` in the body, any `forbidden` word in the title or body (case-insensitive) and parent or `blockedBy`
 * cycles are rejected.
 */
export function validateDrafts(drafts: Draft[], schema: Schema, known: KnownKeys, forbidden: string[] = []): string[] {
	const selected = new Set(drafts.map((draft) => draft.key));
	const seen = new Set<string>();
	const errors = drafts.flatMap((draft) => {
		const form = schema.forms.get(draft.template);
		const draftErrors = [
			...(seen.has(draft.key) ? [`duplicate key ${draft.key}`] : []),
			...(draft.title ? [] : ['title is required']),
			...(form ? sectionErrors(draft, form) : [`template must be one of ${[...schema.forms.keys()].join(', ')}`]),
			...draft.labels
				.filter((label) => schema.labels && !schema.labels.has(label))
				.map((label) => `label "${label}" is not in .github/labels.yml`),
			...referenceErrors(draft, known, selected),
			...contentErrors(draft, forbidden),
		];
		seen.add(draft.key);
		return draftErrors.map((error) => `${draft.file}: ${error}`);
	});
	try {
		orderDrafts(drafts);
	} catch (error) {
		errors.push((error as Error).message);
	}
	return errors;
}

/**
 * Replaces `#{KEY}` tokens with issue numbers; tokens for issues not created yet stay as they are.
 */
export function resolveTokens(body: string, manifest: Manifest): string {
	return body.replace(KEY_TOKEN, (token, key: string) => (manifest[key] ? `#${manifest[key].number}` : token));
}

/**
 * Orders drafts so a parent comes before its sub-issues and a blocker before the issues it blocks.
 *
 * @throws On a parent or `blockedBy` cycle. {@link validateDrafts} reports the same cycle as an error.
 */
export function orderDrafts(drafts: Draft[]): Draft[] {
	const byKey = new Map(drafts.map((draft) => [draft.key, draft]));
	const ordered: Draft[] = [];
	const state = new Map<string, 'visiting' | 'done'>();
	const visit = (draft: Draft) => {
		if (state.get(draft.key) === 'done') return;
		if (state.get(draft.key) === 'visiting') throw new Error(`${draft.file}: parent or blockedBy cycle`);
		state.set(draft.key, 'visiting');
		for (const key of [draft.parent, ...draft.blockedBy]) {
			const dependency = key ? byKey.get(key) : undefined;
			if (dependency) visit(dependency);
		}
		state.set(draft.key, 'done');
		ordered.push(draft);
	};
	for (const draft of drafts) visit(draft);
	return ordered;
}

function gh<T>(method: string, endpoint: string, payload?: unknown): T {
	const args = ['api', '-X', method, endpoint, '-H', 'Accept: application/vnd.github+json'];
	if (payload !== undefined) args.push('--input', '-');
	const output = execFileSync('gh', args, {
		input: payload === undefined ? undefined : JSON.stringify(payload),
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'inherit'],
	});
	return (output.trim() ? JSON.parse(output) : undefined) as T;
}

/**
 * @remarks
 * Reads every page; a repository can have more than the 100 items one page returns.
 */
function ghList<T>(endpoint: string): T[] {
	const output = execFileSync('gh', ['api', '--paginate', '--slurp', endpoint], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
	});
	return (JSON.parse(output) as T[][]).flat();
}

function issueLabels(draft: Draft, schema: Schema): string[] {
	return [...new Set([...(schema.forms.get(draft.template)?.labels ?? []), ...draft.labels])];
}

function ensureLabels(repo: string, names: Set<string>, schema: Schema): void {
	const existing = new Set(
		ghList<{ name: string }>(`repos/${repo}/labels?per_page=100`).map((label) => label.name),
	);
	for (const name of names) {
		if (existing.has(name)) continue;
		gh('POST', `repos/${repo}/labels`, schema.labels?.get(name) ?? { name });
		console.log(`[label] ${name}`);
	}
}

function ensureMilestones(repo: string, titles: Set<string>): Map<string, number> {
	const milestones = new Map(
		ghList<{ title: string; number: number }>(`repos/${repo}/milestones?state=all&per_page=100`).map(
			(milestone) => [milestone.title, milestone.number] as const,
		),
	);
	for (const title of titles) {
		if (milestones.has(title)) continue;
		milestones.set(title, gh<{ number: number }>('POST', `repos/${repo}/milestones`, { title }).number);
		console.log(`[milestone] ${title}`);
	}
	return milestones;
}

function hasToken(body: string): boolean {
	return body.search(KEY_TOKEN) !== -1;
}

type Context = { repo: string; schema: Schema; manifest: Manifest; save: () => void };

function createIssue(draft: Draft, milestones: Map<string, number>, { repo, schema, manifest, save }: Context): void {
	const parent = draft.parent ? manifest[draft.parent] : undefined;
	if (draft.parent && !parent) throw new Error(`${draft.file}: create parent ${draft.parent} first`);
	const body = resolveTokens(draft.body, manifest);
	const issue = gh<{ number: number; id: number; html_url: string }>('POST', `repos/${repo}/issues`, {
		title: draft.title,
		body,
		type: schema.forms.get(draft.template)?.type || undefined,
		labels: issueLabels(draft, schema),
		milestone: draft.milestone ? milestones.get(draft.milestone) : undefined,
		parent_issue_id: parent?.id,
	});
	manifest[draft.key] = { number: issue.number, id: issue.id, url: issue.html_url, bodyResolved: !hasToken(body) };
	save();
	console.log(`[issue] #${issue.number} ${draft.title} ${issue.html_url}`);
}

function linkIssue(draft: Draft, entry: ManifestEntry, { repo, manifest, save }: Context): void {
	if (!entry.bodyResolved) {
		const body = resolveTokens(draft.body, manifest);
		gh('PATCH', `repos/${repo}/issues/${entry.number}`, { body });
		entry.bodyResolved = !hasToken(body);
	}
	const linked = new Set(entry.blockedByLinked ?? []);
	for (const blocker of draft.blockedBy.filter((key) => !linked.has(key) && manifest[key])) {
		execFileSync(
			'gh',
			['issue', 'edit', String(entry.number), '--repo', repo, '--add-blocked-by', String(manifest[blocker].number)],
			{ stdio: ['ignore', 'ignore', 'inherit'] },
		);
		linked.add(blocker);
	}
	entry.blockedByLinked = [...linked];
	save();
}

/**
 * Creates `selected` in order, then resolves `#{KEY}` tokens and "blocked by" links across `pool`.
 *
 * @remarks
 * `pool` is every draft in the folder, so creating one issue also fills in references to it from issues
 * created earlier. The manifest is saved after each issue, so an interrupted run resumes.
 */
function apply(repo: string, selected: Draft[], pool: Draft[], schema: Schema, manifest: Manifest, manifestPath: string): void {
	const context: Context = {
		repo,
		schema,
		manifest,
		save: () => writeFileSync(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`),
	};
	const pending = selected.filter((draft) => !manifest[draft.key]);
	ensureLabels(repo, new Set(pending.flatMap((draft) => issueLabels(draft, schema))), schema);
	const milestones = ensureMilestones(repo, new Set(pending.flatMap((draft) => draft.milestone ?? [])));
	for (const draft of pending) createIssue(draft, milestones, context);
	for (const draft of pool) {
		if (manifest[draft.key]) linkIssue(draft, manifest[draft.key], context);
	}
}

function readDrafts(dir: string): Draft[] {
	return readdirSync(dir)
		.filter((file) => file.endsWith('.md'))
		.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
		.map((file) => parseDraft(file, readFileSync(path.join(dir, file), 'utf8')));
}

/**
 * @remarks
 * `argv[1]` is resolved because the script is often run through a linked skill folder, while
 * `import.meta.filename` is always the real path.
 */
const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename;

if (isMain) {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2).filter((arg) => arg !== '--'),
		options: { repo: { type: 'string' }, forbid: { type: 'string' }, apply: { type: 'boolean', default: false } },
		allowPositionals: true,
	});
	if (positionals.length === 0) throw new Error(USAGE);
	const cwd = process.env.INIT_CWD ?? process.cwd();
	const inputs = positionals.map((input) => {
		const file = path.resolve(cwd, input);
		return { file, isDirectory: statSync(file).isDirectory() };
	});
	const dirs = new Set(inputs.map(({ file, isDirectory }) => (isDirectory ? file : path.dirname(file))));
	if (dirs.size > 1) throw new Error('Pass drafts from one folder at a time; its manifest.json tracks what exists.');
	const [dir] = dirs;

	const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
	const schema = readSchema(root);
	const pool = readDrafts(dir);
	const files = new Set(inputs.filter(({ isDirectory }) => !isDirectory).map(({ file }) => path.basename(file)));
	const selected = files.size > 0 ? pool.filter((draft) => files.has(draft.file)) : pool;
	const manifestPath = path.join(dir, 'manifest.json');
	const manifest: Manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
	const known = { drafts: new Set(pool.map((draft) => draft.key)), created: new Set(Object.keys(manifest)) };
	const errors = validateDrafts(selected, schema, known, values.forbid ? parseList(values.forbid) : []);
	if (errors.length > 0) {
		for (const error of errors) console.error(`[error] ${error}`);
		process.exit(1);
	}

	const ordered = orderDrafts(selected);
	for (const draft of ordered) {
		const status = manifest[draft.key] ? `#${manifest[draft.key].number}` : 'new';
		const links = [
			draft.parent && `parent ${draft.parent}`,
			draft.blockedBy.length > 0 && `blocked by ${draft.blockedBy.join(', ')}`,
			`labels ${issueLabels(draft, schema).join(', ') || '-'}`,
		]
			.filter(Boolean)
			.join('; ');
		console.log(
			`${status.padEnd(5)} ${draft.key.padEnd(4)} ${draft.template.padEnd(8)} ${(draft.milestone ?? '-').padEnd(6)} ${draft.title}${links ? ` (${links})` : ''}`,
		);
	}
	console.log(`\n${ordered.length} drafts valid.`);

	if (values.apply) {
		const repo =
			values.repo ??
			execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd, encoding: 'utf8' }).trim();
		apply(repo, ordered, pool, schema, manifest, manifestPath);
	} else {
		console.log('Dry run. Add --apply to create the new ones.');
	}
}
