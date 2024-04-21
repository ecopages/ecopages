// @ts-expect-error - Types for parseArgs are not available
// biome-ignore lint/style/useNodejsImportProtocol: this is not a Node.js file
import { parseArgs } from 'util';
import { AppBuilder } from '@/build/app-builder';
import { ConfigBuilder } from '@/build/config-builder';
import { CssBuilder } from '@/build/css-builder';
import { PostCssProcessor } from '@/build/postcss-processor';
import { ScriptsBuilder } from '@/build/scripts-builder';
import { StaticPageGenerator } from '@/build/static-page-generator';

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
  options: {
    watch: values.watch as boolean,
    serve: values.serve as boolean,
    build: values.build as boolean,
  },
});

ecoPages.run();
