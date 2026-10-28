import path from 'node:path';
import { parseArgs } from 'node:util';
import { isEcopagesEnvEnabled, setRuntimeModeForCliCommand } from '../env.ts';
import { getRuntimeArgv } from './runtime.ts';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from './resolve-entry-file.ts';

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

const ECOPAGES_BIN_FILES = ['ecopages.ts', 'ecopages.js', 'cli.js'];

const ECOPAGES_AVAILABLE_COMMANDS = ['dev', 'build', 'start', 'preview'];

/**
 * True when this process runs the production server entrypoint or the CLI's start command.
 *
 * @remarks
 * The CLI launches `dist/.server/app.mjs` directly, without forwarding its `start` subcommand.
 */
export function isEcopagesStartCli(runtimeArgv: string[] = getRuntimeArgv()): boolean {
	const entryPath = runtimeArgv[1];
	const isProductionServerEntrypoint =
		entryPath !== undefined &&
		path.basename(path.dirname(path.resolve(entryPath))) === SERVER_BUNDLE_DIR &&
		path.basename(entryPath) === SERVER_BUNDLE_FILENAME;
	return isProductionServerEntrypoint || resolveEcopagesSubcommand(runtimeArgv) === 'start';
}

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
			'serve-only': { type: 'boolean' },
			'keep-going': { type: 'boolean' },
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
