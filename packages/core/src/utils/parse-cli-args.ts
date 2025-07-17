import { parseArgs } from 'node:util';

/**
 * The return type of the parseCliArgs function.
 */
export type ReturnParseCliArgs = {
	preview: boolean;
	build: boolean;
	start: boolean;
	dev: boolean;
	port?: number;
	hostname?: string;
};

const ECOPAGES_BIN_FILE = 'ecopages.ts';

const ECOPAGES_AVAILABLE_COMMANDS = ['dev', 'build', 'start', 'preview'];

/**
 * Parses command line arguments for the server.
 * It returns {@link ReturnParseCliArgs}
 */
export function parseCliArgs(): ReturnParseCliArgs {
	const { values } = parseArgs({
		args: Bun.argv,
		options: {
			dev: { type: 'boolean' },
			preview: { type: 'boolean' },
			build: { type: 'boolean' },
			port: { type: 'string' },
			hostname: { type: 'string' },
		},
		allowPositionals: true,
	});

	let command = '';
	const ecopagesIndex = Bun.argv.findIndex((arg) => arg.endsWith(ECOPAGES_BIN_FILE));

	const isAvailableCommand = ecopagesIndex !== -1;

	if (isAvailableCommand) {
		command =
			ecopagesIndex < Bun.argv.length - 1 &&
			ECOPAGES_AVAILABLE_COMMANDS.some((cmd) => {
				return Bun.argv[ecopagesIndex + 1] === cmd;
			})
				? Bun.argv[ecopagesIndex + 1]
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
		port: values.port,
		hostname: values.hostname,
	};

	return parsedCommandOptions;
}
