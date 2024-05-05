// @ts-expect-error - Types for parseArgs are not available
// biome-ignore lint/style/useNodejsImportProtocol: this is not a Node.js file
import { parseArgs } from 'util';
import { AppBuilder } from '@/main/app-builder';
import { AppConfigurator } from '@/main/app-configurator';
import { CssBuilder } from '@/main/css-builder';
import { IntegrationManager } from '@/main/integration-manager';
import { PostCssProcessor } from '@/main/postcss-processor';
import { ScriptsBuilder } from '@/main/scripts-builder';
import { StaticPageGenerator } from '@/main/static-page-generator';

const { values } = parseArgs({
  args: process.argv.splice(2),
  options: {
    config: {
      type: 'string',
      default: process.cwd(),
      short: 'c',
    },
    watch: {
      type: 'boolean',
      default: false,
      short: 'w',
    },
    serve: {
      type: 'boolean',
      default: false,
      short: 's',
    },
    build: {
      type: 'boolean',
      default: false,
      short: 'b',
    },
    preload: {
      type: 'string',
      short: 'r',
    },
  },
  strict: true,
  allowPositionals: false,
});

const appConfigurator = await AppConfigurator.create({
  projectDir: values.config as string,
});

const ecoPages = new AppBuilder({
  appConfigurator,
  integrationManger: new IntegrationManager({ config: appConfigurator.config }),
  staticPageGenerator: new StaticPageGenerator(appConfigurator.config),
  cssBuilder: new CssBuilder({ processor: PostCssProcessor, config: appConfigurator.config }),
  scriptsBuilder: new ScriptsBuilder({
    config: appConfigurator.config,
    options: { watchMode: values.watch as boolean },
  }),
  options: {
    watch: values.watch as boolean,
    serve: values.serve as boolean,
    build: values.build as boolean,
  },
});

ecoPages.run();
