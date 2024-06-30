import { appLogger } from '@/global/app-logger';
import { AppBuilder } from '@/main/app-builder';
import { AppConfigurator } from '@/main/app-configurator';
import { CssBuilder } from '@/main/css-builder';
import { IntegrationManager } from '@/main/integration-manager';
import { ScriptsBuilder } from '@/main/scripts-builder';
import { StaticPageGenerator } from '@/main/static-page-generator';
import { PostCssProcessor } from '@ecopages/postcss-processor';

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
    cssBuilder: new CssBuilder({ processor: PostCssProcessor, config: appConfigurator.config }),
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
