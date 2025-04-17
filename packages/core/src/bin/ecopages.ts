#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'bun';
import type { EcoPagesAppConfig } from '../internal-types';

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

  const { createApp } = await import('../adapters/bun/create-app');
  const app = await createApp({
    appConfig,
    serverOptions: {
      fetch: async function (this: Server, request: Request) {
        const pathname = new URL(request.url).pathname;
        if (pathname.includes('/api/test')) {
          return new Response(JSON.stringify({ message: 'Hello from the API!' }));
        }
      },
    },
  });

  await app.start();
}
