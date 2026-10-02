import { parseArgs } from 'node:util';
import { getRuntimeArgv } from './runtime.ts';

function getEmbeddedRuntimeCommandOptions(): ReturnParseCliArgs {
	const isDevelopment = process.env.NODE_ENV === 'development';

	return {
		preview: false,
		build: false,
		types: false,
		start: !isDevelopment,
		dev: isDevelopment,
		force: false,
		serveOnly: false,
		port: undefined,
		hostname: undefined,
		reactFastRefresh: undefined,
	};
}

/**
 * Parsed command line arguments for the Ecopages server.
 * @property preview - Whether to run in preview mode
 * @property build - Whether to run a static build
 * @property types - Whether to finalize the config, which writes processor-generated types, and exit
 * @property start - Whether to start the server
 * @property dev - Whether to run in development mode
 * @property port - Optional port number
 * @property hostname - Optional hostname
 * @property reactFastRefresh - Whether React Fast Refresh is enabled
 */
export type ReturnParseCliArgs = {
	preview: boolean;
	build: boolean;
	types: boolean;
	start: boolean;
	dev: boolean;
	force: boolean;
	serveOnly: boolean;
	port?: number;
	hostname?: string;
	reactFastRefresh?: boolean;
};

const ECOPAGES_BIN_FILES = ['ecopages.ts', 'ecopages.js', 'cli.js'];

const ECOPAGES_AVAILABLE_COMMANDS = ['dev', 'build', 'start', 'preview', 'types'];

export type ParseCliArgsOptions = {
	embeddedRuntime?: boolean;
};

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
		types?: boolean;
	},
): {
	isStartCommand: boolean;
	isDevCommand: boolean;
	isBuildCommand: boolean;
	isPreviewCommand: boolean;
	isTypesCommand: boolean;
} {
	const isStartCommand =
		command === 'start' ||
		(!values.dev && !values.build && !values.preview && !values.types && command !== 'types');
	const isDevCommand = command === 'dev' || !!values.dev;
	const isBuildCommand = command === 'build' || !!values.build;
	const isPreviewCommand = command === 'preview' || !!values.preview;
	const isTypesCommand = command === 'types' || !!values.types;
	return { isStartCommand, isDevCommand, isBuildCommand, isPreviewCommand, isTypesCommand };
}

function applyNodeEnvForCliCommand(isDevCommand: boolean): void {
	if (isDevCommand) {
		process.env.NODE_ENV ??= 'development';
	} else {
		process.env.NODE_ENV = 'production';
	}
}

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
			types: { type: 'boolean' },
			force: { type: 'boolean' },
			'serve-only': { type: 'boolean' },
			port: { type: 'string' },
			hostname: { type: 'string' },
			'react-fast-refresh': { type: 'boolean' },
		},
		allowPositionals: true,
	});

	const command = resolveEcopagesSubcommand(runtimeArgv);
	const { isStartCommand, isDevCommand, isBuildCommand, isPreviewCommand, isTypesCommand } = deriveCliCommandFlags(
		command,
		values,
	);

	const parsedCommandOptions = {
		preview: isPreviewCommand,
		build: isBuildCommand,
		types: isTypesCommand,
		start: isStartCommand,
		dev: isDevCommand,
		force: !!values.force,
		serveOnly: !!values['serve-only'] || process.env.ECOPAGES_PREVIEW_SERVE_ONLY === 'true',
		port: values.port ? Number(values.port) : undefined,
		hostname: values.hostname,
		reactFastRefresh: values['react-fast-refresh'],
	};

	applyNodeEnvForCliCommand(isDevCommand);

	return parsedCommandOptions;
}
