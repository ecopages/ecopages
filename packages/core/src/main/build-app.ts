import fs from 'node:fs';
import path from 'node:path';
import { PostCssProcessor } from '@ecopages/postcss-processor';
import { appLogger } from '../global/app-logger.ts';
import { AppBuilder } from '../main/app-builder.ts';
import { CssBuilder } from '../main/css-builder.ts';
import { ScriptsBuilder } from '../main/scripts-builder.ts';
import { StaticPageGenerator } from '../main/static-page-generator.ts';

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

  const { default: appConfig } = await import(configPath);

  new AppBuilder({
    appConfig,
    staticPageGenerator: new StaticPageGenerator(appConfig),
    cssBuilder: new CssBuilder({ processor: PostCssProcessor, appConfig: appConfig }),
    scriptsBuilder: new ScriptsBuilder({
      appConfig,
      options: { watchMode: watch as boolean },
    }),
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
