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

const ECOPAGES_BIN_FILES = ['ecopages.ts', 'ecopages.js', 'cli.js'];

const ECOPAGES_AVAILABLE_COMMANDS = ['dev', 'build', 'start', 'preview'];

function resolveEcopagesSubcommand(runtimeArgv: string[]): string {
	const ecopagesIndex = runtimeArgv.findIndex((arg) => ECOPAGES_BIN_FILES.some((filename) => arg.endsWith(filename)));
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

function deriveCliCommandFlags(
	command: string,
	values: {
		dev?: boolean;
		build?: boolean;
		preview?: boolean;
	},
): {
	isStartCommand: boolean;
	isDevCommand: boolean;
	isBuildCommand: boolean;
	isPreviewCommand: boolean;
} {
	const isStartCommand = command === 'start' || (command === '' && !values.dev && !values.build && !values.preview);
	const isDevCommand = command === 'dev' || !!values.dev;
	const isBuildCommand = command === 'build' || !!values.build;
	const isPreviewCommand = command === 'preview' || !!values.preview;
	return { isStartCommand, isDevCommand, isBuildCommand, isPreviewCommand };
}

/**
 * Whether the process runs a production export: `ecopages build`, or `ecopages preview` without `--serve-only`.
 *
 * @remarks
 * Reads the same arguments as {@link parseCliArgs} without setting the runtime mode, and ignores options it does not
 * know, so config finalization can call it in any process, a test runner included.
 */
export function isProductionExportCommand(): boolean {
	const runtimeArgv = getRuntimeArgv();
	const { values } = parseArgs({
		args: runtimeArgv,
		options: {
			dev: { type: 'boolean' },
			preview: { type: 'boolean' },
			build: { type: 'boolean' },
			'serve-only': { type: 'boolean' },
		},
		allowPositionals: true,
		strict: false,
	});
	const { isBuildCommand, isPreviewCommand } = deriveCliCommandFlags(resolveEcopagesSubcommand(runtimeArgv), {
		dev: values.dev === true,
		build: values.build === true,
		preview: values.preview === true,
	});
	const serveOnly = values['serve-only'] === true || isEcopagesEnvEnabled('ECOPAGES_PREVIEW_SERVE_ONLY');
	return isBuildCommand || (isPreviewCommand && !serveOnly);
}

/**
 * Parses command line arguments for the server.
 * It returns {@link ReturnParseCliArgs}
 */
export function parseCliArgs(): ReturnParseCliArgs {
	const runtimeArgv = getRuntimeArgv();

	const { values } = parseArgs({
		args: runtimeArgv,
		options: {
			dev: { type: 'boolean' },
			preview: { type: 'boolean' },
			build: { type: 'boolean' },
			...ENTRY_FLAG_OPTIONS,
			port: { type: 'string' },
			hostname: { type: 'string' },
		},
		allowPositionals: true,
	});

	const command = resolveEcopagesSubcommand(runtimeArgv);
	const { isStartCommand, isDevCommand, isBuildCommand, isPreviewCommand } = deriveCliCommandFlags(command, values);

	const parsedCommandOptions = {
		preview: isPreviewCommand,
		build: isBuildCommand,
		start: isStartCommand,
		dev: isDevCommand,
		serveOnly: !!values['serve-only'] || isEcopagesEnvEnabled('ECOPAGES_PREVIEW_SERVE_ONLY'),
		keepGoing: !!values['keep-going'],
		port: values.port ? Number(values.port) : undefined,
		hostname: values.hostname,
	};

	setRuntimeModeForCliCommand(isDevCommand);

	return parsedCommandOptions;
}
