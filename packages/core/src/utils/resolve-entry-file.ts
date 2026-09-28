import { parseArgs } from 'node:util';
import { getRuntimeArgv } from './runtime.ts';

/**
 * The default entry file name when no other source provides a value.
 */
export const DEFAULT_ENTRY_FILE = 'app.ts';

/**
 * The environment variable used to override the entry file path.
 */
export const ENTRY_FILE_ENV = 'ECOPAGES_ENTRY_FILE';

/**
 * Centralized definition of the entry-file CLI argument.
 *
 * Exported so callers (CLI, tests, docs) reference a single source of truth
 * for the flag name, short alias, and type. Keep this in sync with
 * `resolveEntryFile` below.
 */
export const entryFileOptions = {
	'entry-file': { type: 'string', short: 'e' },
} as const;

/**
 * The long flag name for the entry file option. Re-exported as a
 * constant so consumers don't hardcode the string.
 */
export const ENTRY_FILE_FLAG = 'entry-file';

/**
 * Resolved sources for the entry file, in precedence order (highest first):
 *
 * 1. `entryFile` argument — explicit caller override (e.g. constructor)
 * 2. `ECOPAGES_ENTRY_FILE` env var — set by the CLI when spawning
 * 3. `--entry-file` / `-e` CLI flag — read from `process.argv` via `parseArgs`
 * 4. `app.ts` — the framework default
 */
export interface ResolveEntryFileOptions {
	/** Explicit override (e.g. constructor param or test fixture). */
	entryFile?: string;
	/** Environment to read `ECOPAGES_ENTRY_FILE` from. Defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** Argv to parse. Defaults to `process.argv`. */
	argv?: string[];
}

/**
 * Resolves the entry file path using standard precedence.
 *
 * This is the single source of truth for entry-file resolution across
 * the CLI, build pipeline, and runtime. Both the CLI layer and the
 * runtime builders call into this function instead of reimplementing
 * the precedence chain.
 *
 * @example
 *   resolveEntryFile();                                     // 'app.ts' (or env/argv)
 *   resolveEntryFile({ entryFile: 'src/server.ts' });       // 'src/server.ts'
 *   resolveEntryFile({ env: { ECOPAGES_ENTRY_FILE: 'x' }}); // 'x'
 *   resolveEntryFile({ argv: ['node', '-e', 'flag.ts'] });  // 'flag.ts'
 */
export function resolveEntryFile({
	entryFile,
	env = process.env as Record<string, string | undefined>,
	argv = getRuntimeArgv(),
}: ResolveEntryFileOptions = {}): string {
	if (entryFile && entryFile.length > 0) return entryFile;

	const fromEnv = env[ENTRY_FILE_ENV];
	if (fromEnv && fromEnv.length > 0) return fromEnv;

	const fromFlag = readEntryFileFlag(argv);
	if (fromFlag) return fromFlag;

	return DEFAULT_ENTRY_FILE;
}

/**
 * Parses argv for the entry-file flag using the shared `parseArgs` config.
 *
 * Exposed for callers that need the raw flag value without the full
 * precedence chain (e.g. CLI help text, validation).
 */
export function readEntryFileFlag(argv: string[] = getRuntimeArgv()): string | undefined {
	const { values } = parseArgs({
		args: argv.slice(1),
		options: { ...entryFileOptions },
		strict: false,
	});

	const raw = values[ENTRY_FILE_FLAG as string];
	return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/**
 * The subdirectory inside `dist/` where the bundled server entry is placed.
 */
export const SERVER_BUNDLE_DIR = '.server';

/**
 * The filename of the bundled server entry.
 */
export const SERVER_BUNDLE_FILENAME = 'app.mjs';
