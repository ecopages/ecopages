import { parseArgs } from 'node:util';
import { isEcopagesEnvEnabled, setRuntimeModeForCliCommand } from '../env.ts';
import { ENTRY_COMMAND_FLAGS, type EntryCommandFlagName } from './entry-command-flags.ts';
import { getRuntimeArgv } from './runtime.ts';

/**
 * Parsed command line arguments for the Ecopages server.
 * @property preview - Whether to run in preview mode
 * @property build - Whether to run a static build
 * @property start - Whether to start the server
 * @property dev - Whether to run in development mode
 * @property port - Optional port number
 * @property hostname - Optional hostname
 */
export type ReturnParseCliArgs = {
	preview: boolean;
	build: boolean;
	start: boolean;
	dev: boolean;
	serveOnly: boolean;
	keepGoing: boolean;
	port?: number;
	hostname?: string;
};

const ENTRY_FLAG_OPTIONS = Object.fromEntries(
	Object.keys(ENTRY_COMMAND_FLAGS).map((name) => [name, { type: 'boolean' }]),
) as Record<EntryCommandFlagName, { type: 'boolean' }>;

const ENTRY_PARSE_OPTIONS = {
	dev: { type: 'boolean' },
	preview: { type: 'boolean' },
	build: { type: 'boolean' },
	...ENTRY_FLAG_OPTIONS,
	port: { type: 'string' },
	hostname: { type: 'string' },
} as const;

const ECOPAGES_BIN_FILES = ['ecopages.ts', 'ecopages.js'];

const ECOPAGES_PACKAGE_BIN = /(^|\/)ecopages\/bin\/cli\.js$/;

const ECOPAGES_AVAILABLE_COMMANDS = ['dev', 'build', 'start', 'preview'];

function isEcopagesBin(arg: string): boolean {
	const normalized = arg.replaceAll('\\', '/');
	return (
		ECOPAGES_BIN_FILES.some((filename) => normalized.endsWith(filename)) || ECOPAGES_PACKAGE_BIN.test(normalized)
	);
}

function resolveEcopagesSubcommand(runtimeArgv: string[]): string {
	const ecopagesIndex = runtimeArgv.findIndex(isEcopagesBin);
	if (ecopagesIndex === -1) {
		return '';
	}
	if (
		ecopagesIndex < runtimeArgv.length - 1 &&
		ECOPAGES_AVAILABLE_COMMANDS.some((cmd) => runtimeArgv[ecopagesIndex + 1] === cmd)
	) {
		return runtimeArgv[ecopagesIndex + 1];
	}
	return 'start';
}

/**
 * What the process was asked to do: the CLI mode flags and options, before any runtime mode is set.
 *
 * @remarks
 * Pure, so {@link parseCliArgs} and the app runtime's default global-script resolution read the same flags and
 * cannot disagree on build or serve mode. It ignores arguments it does not declare unless `strict` is set, so the
 * runtime default is safe in any process, a test runner included. The ecopages bin is the `ecopages.ts`/`ecopages.js` entry or the
 * `ecopages` package's `bin/cli.js`; another tool's `cli.js` is not treated as it.
 */
export function resolveEntryCommand(
	argv: string[],
	{ environment, strict = false }: { environment?: NodeJS.ProcessEnv; strict?: boolean } = {},
): ReturnParseCliArgs {
	const { values } = parseArgs({ args: argv, options: ENTRY_PARSE_OPTIONS, allowPositionals: true, strict });
	const command = resolveEcopagesSubcommand(argv);
	const dev = command === 'dev' || values.dev === true;
	const build = command === 'build' || values.build === true;
	const preview = command === 'preview' || values.preview === true;
	const start = command === 'start' || (command === '' && !dev && !build && !preview);
	const port = typeof values.port === 'string' && values.port !== '' ? Number(values.port) : undefined;

	return {
		preview,
		build,
		start,
		dev,
		serveOnly: values['serve-only'] === true || isEcopagesEnvEnabled('ECOPAGES_PREVIEW_SERVE_ONLY', environment),
		keepGoing: values['keep-going'] === true,
		port,
		hostname: typeof values.hostname === 'string' ? values.hostname : undefined,
	};
}

/**
 * Whether a resolved entry command is a production export: a build, or a preview that is not serve-only.
 */
export function isProductionExport(command: Pick<ReturnParseCliArgs, 'build' | 'preview' | 'serveOnly'>): boolean {
	return command.build || (command.preview && !command.serveOnly);
}

/**
 * Parses command line arguments for the server and sets the runtime mode.
 * It returns {@link ReturnParseCliArgs}
 */
export function parseCliArgs(): ReturnParseCliArgs {
	const parsed = resolveEntryCommand(getRuntimeArgv(), { strict: true });
	setRuntimeModeForCliCommand(parsed.dev);
	return parsed;
}
