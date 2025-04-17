import { parseArgs } from 'node:util';

const DEFAULT_PORT = 3000;
const DEFAULT_HOSTNAME = 'localhost';

/**
 * The return type of the parseCliArgs function.
 */
export type ReturnParseCliArgs = {
  preview: boolean;
  build: boolean;
  start: boolean;
  dev: boolean;
  port: number;
  hostname: string;
};

const ECOPAGES_COMMAND = 'ecopages';

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
  const ecopagesIndex = Bun.argv.findIndex((arg) => arg.includes(ECOPAGES_COMMAND));

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

  const isDevCommand = command === 'dev';
  const isBuildCommand = command === 'build';
  const isStartCommand = command === 'start';
  const isPreviewCommand = command === 'preview';

  const parsedCommandOptions = {
    preview: Boolean(values.preview) || isPreviewCommand,
    build: Boolean(values.build) || isBuildCommand,
    start: isStartCommand,
    dev: isDevCommand || (!isPreviewCommand && !isBuildCommand && !isStartCommand && !values.preview && !values.build),
    port: values.port ? Number.parseInt(values.port) : DEFAULT_PORT,
    hostname: values.hostname || DEFAULT_HOSTNAME,
  };

  return parsedCommandOptions;
}
