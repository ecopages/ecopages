import { AppBuilder } from '@/main/app-builder';
import { AppConfigurator } from '@/main/app-configurator';
import { CssBuilder } from '@/main/css-builder';
import { IntegrationManager } from '@/main/integration-manager';
import { PostCssProcessor } from '@/main/postcss-processor';
import { ScriptsBuilder } from '@/main/scripts-builder';
import { StaticPageGenerator } from '@/main/static-page-generator';

export async function buildAll({
  config = process.cwd(),
  watch = false,
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
