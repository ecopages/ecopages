import { parseArgs } from 'node:util';

const DEFAULT_PORT = 3000;
const DEFAULT_HOSTNAME = 'localhost';

/**
 * Parses command line arguments for the server.
 * @returns {Object} An object containing the parsed command line arguments.
 * @property {boolean} watch - Indicates if the watch mode is enabled.
 * @property {boolean} preview - Indicates if the preview mode is enabled.
 * @property {boolean} build - Indicates if the build mode is enabled.
 * @property {number} port - The port number to use.
 * @property {string} hostname - The hostname to use.
 */
export function parseCliArgs() {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      watch: { type: 'boolean' },
      preview: { type: 'boolean' },
      build: { type: 'boolean' },
      port: { type: 'string' },
      hostname: { type: 'string' },
    },
    allowPositionals: true,
  });

  return {
    watch: Boolean(values.watch),
    preview: Boolean(values.preview),
    build: Boolean(values.build),
    dev: !values.watch && !values.preview && !values.build,
    port: values.port ? Number.parseInt(values.port) : DEFAULT_PORT,
    hostname: values.hostname || DEFAULT_HOSTNAME,
  };
}
