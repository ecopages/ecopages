import fs from 'node:fs';
import path from 'node:path';
import { PostCssProcessor } from '@ecopages/postcss-processor';
import { appLogger } from '../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { AppBuilder } from '../main/app-builder.ts';
import { ScriptsBuilder } from '../main/scripts-builder.ts';
import { StaticPageGenerator } from '../main/static-page-generator.ts';
import { CssParserService } from '../services/css-parser.service.ts';
import { DependencyService } from '../services/dependency.service.ts';
import { HtmlTransformerService } from '../services/html-transformer.service.ts';
import { IntegrationManager } from './integration-manager.ts';

const validateConfig = (config: unknown): EcoPagesAppConfig => {
  if (!config) {
    throw new Error('[ecopages] Invalid config file, please provide a valid config file.');
  }
  return config as EcoPagesAppConfig;
};

export async function buildApp({
  rootDir = process.cwd(),
  watch = true,
  serve = false,
  build = false,
}: {
  rootDir: string;
  watch: boolean;
  serve: boolean;
  build: boolean;
}) {
  const configPath = path.resolve(rootDir, 'eco.config.ts');

  if (!fs.existsSync(configPath)) {
    throw new Error('[ecopages] eco.config.ts not found, please provide a valid config file.');
  }

  const config = await import(configPath);
  const appConfig = validateConfig(config.default);

  new AppBuilder({
    appConfig,
    staticPageGenerator: new StaticPageGenerator({
      appConfig,
      integrationManager: new IntegrationManager({ appConfig }),
    }),
    cssParser: new CssParserService({ processor: PostCssProcessor, appConfig }),
    scriptsBuilder: new ScriptsBuilder({
      appConfig,
      options: { watchMode: watch as boolean },
    }),
    dependencyService: new DependencyService({ appConfig }),
    htmlTransformer: new HtmlTransformerService(),
    options: {
      watch: watch as boolean,
      serve: serve as boolean,
      build: build as boolean,
    },
  }).run();
}

if (process.argv.slice(2).includes('--watch-lib')) {
  appLogger.warn('Running app in watch mode for library development.');
  import.meta.env.NODE_ENV = 'development';
  buildApp({
    rootDir: process.cwd(),
    watch: true,
    serve: false,
    build: false,
  });
}
