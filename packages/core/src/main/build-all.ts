// @ts-expect-error - Types for parseArgs are not available
// biome-ignore lint/style/useNodejsImportProtocol: this is not a Node.js file
import { parseArgs } from 'util';
import { IntegrationManger } from '@/integrations/integration-manager';
import { AppBuilder } from '@/main/app-builder';
import { ConfigBuilder } from '@/main/config-builder';
import { CssBuilder } from '@/main/css-builder';
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

const config = await ConfigBuilder.create({
  projectDir: values.config as string,
});

const ecoPages = new AppBuilder({
  config,
  staticPageGenerator: new StaticPageGenerator(config),
  cssBuilder: new CssBuilder({ processor: PostCssProcessor, config }),
  scriptsBuilder: new ScriptsBuilder({
    config,
    options: { watchMode: values.watch as boolean },
  }),
  integrationManager: new IntegrationManger({ config, integrations: config.integrations }),
  options: {
    watch: values.watch as boolean,
    serve: values.serve as boolean,
    build: values.build as boolean,
  },
});

ecoPages.run();
