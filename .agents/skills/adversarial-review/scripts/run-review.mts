/**
 * Sends a change, already reviewed by its author, to another agent harness and model for a second review,
 * read-only, and prints its findings.
 *
 * Usage: node --experimental-strip-types run-review.mts --base <ref> --notes <file> [--round 1|2] [--harness <h> --model <m>]
 *
 * Run it from inside the repository. `--notes` holds the author's own review: what it found, fixed and left, and in
 * round 2 what was done with each round 1 finding. `ADVERSARIAL_REVIEW_HARNESS`, `ADVERSARIAL_REVIEW_MODEL` and the
 * optional `ADVERSARIAL_REVIEW_API_KEY` come from the environment or the repository's root `.env`. `--harness` and
 * `--model` replace both variables, for a review on the caller's own harness when none is configured; the API key is
 * then not used, because it belongs to the configured harness. The reviewer's brief is ../references/brief.md.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const USAGE =
	'Usage: node --experimental-strip-types run-review.mts --base <ref> --notes <file> [--round 1|2] [--harness <h> --model <m>]';

/**
 * @remarks
 * Every harness takes the prompt as one argument, and Linux caps a single argument at 128 KiB. Review a larger
 * change in parts, with a nearer `--base`.
 */
const MAX_PROMPT_BYTES = 120_000;

/**
 * Matches a fast variant such as `grok-4.7-high-fast`. Reviews always run on the full model.
 */
const FAST_MODEL = /\bfast\b/i;


/**
 * The headless, read-only command for each harness.
 *
 * @remarks
 * The prompt goes last. Claude's `--allowedTools` takes several values, so the prompt must follow `-p`, not it.
 * Claude's fast mode is a setting rather than a model id, so it is switched off for the run. Cursor refuses to run
 * headless in an untrusted folder; `--trust` answers that prompt only, and `--mode ask` still keeps it read-only.
 */
const HARNESSES: Partial<Record<string, (prompt: string, model: string) => string[]>> = {
	claude: (prompt, model) => [
		'claude',
		'--model',
		model,
		'--settings',
		'{"fastMode":false}',
		'--permission-mode',
		'dontAsk',
		'--allowedTools',
		'Read,Grep,Glob',
		'-p',
		prompt,
	],
	codex: (prompt, model) => ['codex', 'exec', '--sandbox', 'read-only', '--model', model, prompt],
	cursor: (prompt, model) => [
		'cursor-agent',
		'-p',
		'--trust',
		'--mode',
		'ask',
		'--output-format',
		'text',
		'--model',
		model,
		prompt,
	],
	opencode: (prompt, model) => ['opencode', 'run', '--agent', 'plan', '--model', model, prompt],
};

/**
 * The variable each harness reads an API key from. `ADVERSARIAL_REVIEW_API_KEY` is passed to the reviewer under this
 * name, so the coding agent's own key is left alone.
 *
 * @remarks
 * OpenCode keeps one key per provider, set with `opencode auth login`, so it has no entry.
 */
const API_KEY_VARS: Partial<Record<string, string>> = {
	claude: 'ANTHROPIC_API_KEY',
	codex: 'CODEX_API_KEY',
	cursor: 'CURSOR_API_KEY',
};

/**
 * @remarks
 * The diff sits in the prompt so the reviewer needs no shell, which not every harness allows in read-only mode.
 * Untracked files are listed by path for the reviewer to read. The notes and the diff are fenced with a random tag,
 * so a `</diff>` inside the change cannot end its section early.
 */
function buildPrompt(review: {
	brief: string;
	round: string;
	notes: string;
	base: string;
	diff: string;
	untracked: string[];
}): string {
	const { brief, round, notes, base, diff, untracked } = review;
	const tag = randomUUID().slice(0, 8);
	const files = untracked.length > 0 ? untracked.map((file) => `- ${file}`).join('\n') : 'None.';
	return `${brief}\n## This review\n\nRound ${round} of 2.\n\nThe author's notes:\n\n<notes-${tag}>\n${notes.trim()}\n</notes-${tag}>\n\nEverything since the merge base with \`${base}\`, committed or not:\n\n<diff-${tag}>\n${diff}</diff-${tag}>\n\nNew untracked files, not in the diff; read them:\n\n${files}\n`;
}

/**
 * @remarks
 * `argv[1]` is resolved because the script is often run through a linked skill folder, while
 * `import.meta.filename` is always the real path.
 */
const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename;

if (isMain) {
	const { values } = parseArgs({
		args: process.argv.slice(2).filter((arg) => arg !== '--'),
		options: {
			base: { type: 'string' },
			notes: { type: 'string' },
			round: { type: 'string', default: '1' },
			harness: { type: 'string' },
			model: { type: 'string' },
		},
	});
	if (!values.base || !values.notes) throw new Error(USAGE);
	if (values.round !== '1' && values.round !== '2') {
		throw new Error(
			'There are at most two rounds: --round 1 looks for defects, --round 2 checks the fixes. After round 2, report what is left instead of asking again.',
		);
	}
	const notes = readFileSync(path.resolve(values.notes), 'utf8');
	if (!notes.trim()) {
		throw new Error(`${values.notes} is empty. Write what your own review found, fixed and left before asking for a second one.`);
	}

	const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	const root = git('rev-parse', '--show-toplevel').trim();
	try {
		process.loadEnvFile(path.join(root, '.env'));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}

	if (values.model !== undefined && values.harness === undefined) throw new Error('--model needs --harness.');
	const fromFlags = values.harness !== undefined;
	const harness = (fromFlags ? values.harness : process.env.ADVERSARIAL_REVIEW_HARNESS) ?? '';
	const model = (fromFlags ? values.model : process.env.ADVERSARIAL_REVIEW_MODEL) ?? '';
	const supported = Object.keys(HARNESSES).join(', ');
	if (!harness) {
		console.error(
			`No review harness is configured. Set ADVERSARIAL_REVIEW_HARNESS to one of ${supported} in ${path.join(root, '.env')}, or pass --harness and --model to review on your own harness with another model.`,
		);
		process.exit(2);
	}
	const build = HARNESSES[harness];
	if (!build) throw new Error(`The harness "${harness}" is not supported. Use one of ${supported}.`);
	if (!model || FAST_MODEL.test(model)) {
		throw new Error(
			`The model is ${model ? `"${model}", a fast variant` : 'not set'}. Set an exact model id without "fast"; a harness default or a bare alias can resolve to a fast variant.`,
		);
	}

	const diff = git('-C', root, 'diff', git('-C', root, 'merge-base', values.base, 'HEAD').trim());
	const untracked = git('-C', root, 'ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
	if (!diff && untracked.length === 0) {
		console.log(`Nothing to review: no changes since the merge base with ${values.base}.`);
		process.exit(0);
	}

	const brief = readFileSync(path.join(import.meta.dirname, '../references/brief.md'), 'utf8');
	const prompt = buildPrompt({ brief, round: values.round, notes, base: values.base, diff, untracked });
	const bytes = Buffer.byteLength(prompt);
	if (bytes > MAX_PROMPT_BYTES) {
		throw new Error(`The change is ${bytes} bytes, over the ${MAX_PROMPT_BYTES}-byte prompt limit. Use a nearer --base.`);
	}

	const apiKey = fromFlags ? undefined : process.env.ADVERSARIAL_REVIEW_API_KEY;
	const apiKeyVar = API_KEY_VARS[harness];
	if (apiKey && !apiKeyVar) console.error(`ADVERSARIAL_REVIEW_API_KEY is not used by ${harness}; log in with its own CLI.`);
	const env = apiKey && apiKeyVar ? { ...process.env, [apiKeyVar]: apiKey } : process.env;

	const [command, ...args] = build(prompt, model);
	const result = spawnSync(command, args, { cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'] });
	if (result.error) {
		console.error(`Could not run ${command}. Install it and log in.`);
		throw result.error;
	}
	process.exitCode = result.status ?? 1;
}
