import { AppBuilder } from '@/main/app-builder';
import { AppConfigurator } from '@/main/app-configurator';
import { CssBuilder } from '@/main/css-builder';
import { IntegrationManager } from '@/main/integration-manager';
import { PostCssProcessor } from '@/main/postcss-processor';
import { ScriptsBuilder } from '@/main/scripts-builder';
import { StaticPageGenerator } from '@/main/static-page-generator';

const appConfigurator = await AppConfigurator.create({
  projectDir: process.cwd(),
});

const ecoPages = new AppBuilder({
  appConfigurator,
  integrationManger: new IntegrationManager({ config: appConfigurator.config }),
  staticPageGenerator: new StaticPageGenerator(appConfigurator.config),
  cssBuilder: new CssBuilder({ processor: PostCssProcessor, config: appConfigurator.config }),
  scriptsBuilder: new ScriptsBuilder({
    config: appConfigurator.config,
    options: { watchMode: true },
  }),
  options: {
    watch: true,
    serve: false,
    build: false,
  },
});

ecoPages.run();
