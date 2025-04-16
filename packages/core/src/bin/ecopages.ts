#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '@ecopages/logger';
import type { EcoPagesAppConfig } from 'src/internal-types';
import { parseCliArgs } from '../utils/parse-cli-args';

const { watch, preview, build, port, hostname } = parseCliArgs();

const isBun = process.versions.bun !== undefined;

const validateConfig = (config: unknown): EcoPagesAppConfig => {
  if (!config) {
    throw new Error('[ecopages] Invalid config file, please provide a valid config file.');
  }
  return config as EcoPagesAppConfig;
};

if (isBun) {
  const configPath = path.resolve(process.cwd(), 'eco.config.ts');

  if (!fs.existsSync(configPath)) {
    throw new Error('[ecopages] eco.config.ts not found, please provide a valid config file.');
  }

  const config = await import(configPath);

  const appConfig = validateConfig(config.default);

  const { createServerAdapter } = await import('../adapters/bun/server-adapter');
  const appLogger = new Logger('[ecopages]');
  const { getServerOptions, buildStatic } = await createServerAdapter({
    appConfig,
    options: { watch },
    serveOptions: {
      port,
      hostname,
    },
  });
  const enableHmr = watch || (!preview && !build);
  const server = Bun.serve(getServerOptions({ enableHmr }));

  if (!build && !preview) {
    appLogger.info(`Server running at http://${server.hostname}:${server.port}`);
  }

  if (build || preview) {
    appLogger.debugTime('Building static pages');
    await buildStatic({ preview });
    server.stop(true);
    appLogger.debugTimeEnd('Building static pages');
  }

  if (build) {
    process.exit(0);
  }

  if (preview) {
    appLogger.info(`Preview running at http://${server.hostname}:${server.port}`);
  }
}
