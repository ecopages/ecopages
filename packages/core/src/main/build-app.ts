import { PostCssProcessor } from '@ecopages/postcss-processor';
import { appLogger } from '../global/app-logger.ts';
import { AppBuilder } from '../main/app-builder.ts';
import { AppConfigurator } from '../main/app-configurator.ts';
import { CssBuilder } from '../main/css-builder.ts';
import { IntegrationManager } from '../main/integration-manager.ts';
import { ScriptsBuilder } from '../main/scripts-builder.ts';
import { StaticPageGenerator } from '../main/static-page-generator.ts';

export async function buildApp({
  config = process.cwd(),
  watch = true,
  serve = false,
  build = false,
}: {
  config: string;
  watch: boolean;
  serve: boolean;
  build: boolean;
}) {
  const appConfigurator = await AppConfigurator.create({
    projectDir: config as string,
  });

  const ecoPages = new AppBuilder({
    appConfigurator,
    integrationManger: new IntegrationManager({ config: appConfigurator.config }),
    staticPageGenerator: new StaticPageGenerator(appConfigurator.config),
    cssBuilder: new CssBuilder({ processor: PostCssProcessor, appConfig: appConfigurator.config }),
    scriptsBuilder: new ScriptsBuilder({
      config: appConfigurator.config,
      options: { watchMode: watch as boolean },
    }),
    options: {
      watch: watch as boolean,
      serve: serve as boolean,
      build: build as boolean,
    },
  });

  ecoPages.run();
}

if (process.argv.slice(2).includes('--watch-lib')) {
  appLogger.warn('Running app in watch mode for library development.');
  import.meta.env.NODE_ENV = 'development';
  buildApp({
    config: process.cwd(),
    watch: true,
    serve: false,
    build: false,
  });
}
