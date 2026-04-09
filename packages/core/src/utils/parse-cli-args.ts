import { parseArgs } from 'node:util';
import { getRuntimeArgv } from './runtime.ts';

function getEmbeddedRuntimeCommandOptions(): ReturnParseCliArgs {
	const isDevelopment = process.env.NODE_ENV === 'development';

	return {
		preview: false,
		build: false,
		start: !isDevelopment,
		dev: isDevelopment,
		port: undefined,
		hostname: undefined,
		reactFastRefresh: undefined,
	};
}

/**
 * Parsed command line arguments for the Ecopages server.
 * @property preview - Whether to run in preview mode
 * @property build - Whether to run a static build
 * @property start - Whether to start the server
 * @property dev - Whether to run in development mode
 * @property port - Optional port number
 * @property hostname - Optional hostname
 * @property reactFastRefresh - Whether React Fast Refresh is enabled
 */
export type ReturnParseCliArgs = {
	preview: boolean;
	build: boolean;
	start: boolean;
	dev: boolean;
	port?: number;
	hostname?: string;
	reactFastRefresh?: boolean;
};

const ECOPAGES_BIN_FILES = ['ecopages.ts', 'ecopages.js', 'cli.js'];

const ECOPAGES_AVAILABLE_COMMANDS = ['dev', 'build', 'start', 'preview'];

export type ParseCliArgsOptions = {
	embeddedRuntime?: boolean;
};

/**
 * Parses command line arguments for the server.
 * It returns {@link ReturnParseCliArgs}
 */
export function parseCliArgs(options: ParseCliArgsOptions = {}): ReturnParseCliArgs {
	if (options.embeddedRuntime || process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME === 'true') {
		return getEmbeddedRuntimeCommandOptions();
	}

	const runtimeArgv = getRuntimeArgv();

	const { values } = parseArgs({
		args: runtimeArgv,
		options: {
			dev: { type: 'boolean' },
			preview: { type: 'boolean' },
			build: { type: 'boolean' },
			port: { type: 'string' },
			hostname: { type: 'string' },
			'react-fast-refresh': { type: 'boolean' },
		},
		allowPositionals: true,
	});

	let command = '';
	const ecopagesIndex = runtimeArgv.findIndex((arg) => ECOPAGES_BIN_FILES.some((filename) => arg.endsWith(filename)));

	const isAvailableCommand = ecopagesIndex !== -1;

	if (isAvailableCommand) {
		command =
			ecopagesIndex < runtimeArgv.length - 1 &&
			ECOPAGES_AVAILABLE_COMMANDS.some((cmd) => {
				return runtimeArgv[ecopagesIndex + 1] === cmd;
			})
				? runtimeArgv[ecopagesIndex + 1]
				: 'start';
	}

	const isStartCommand = command === 'start' || (!values.dev && !values.build && !values.preview);
	const isDevCommand = command === 'dev' || !!values.dev;
	const isBuildCommand = command === 'build' || !!values.build;
	const isPreviewCommand = command === 'preview' || !!values.preview;

	const parsedCommandOptions = {
		preview: isPreviewCommand,
		build: isBuildCommand,
		start: isStartCommand,
		dev: isDevCommand,
		port: values.port ? Number(values.port) : undefined,
		hostname: values.hostname,
		reactFastRefresh: values['react-fast-refresh'],
	};

	if (!process.env.NODE_ENV) {
		process.env.NODE_ENV = isDevCommand ? 'development' : 'production';
	}

	return parsedCommandOptions;
}
