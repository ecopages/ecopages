import { parseArgs } from "util";
import { EcoPagesBuilder } from "@/build/eco-pages-builder";
import { createGlobalConfig } from "@/build/create-global-config";
import { StaticPageGenerator } from "./static-page-generator";
import { CssBuilder } from "./css-builder";
import { PostCssProcessor } from "./postcss-processor";
import { ScriptsBuilder } from "./scripts-builder";

const { values } = parseArgs({
  args: process.argv.splice(2),
  options: {
    config: {
      type: "string",
      default: process.cwd(),
      short: "c",
    },
    watch: {
      type: "boolean",
      default: false,
      short: "w",
    },
    serve: {
      type: "boolean",
      default: false,
      short: "s",
    },
  },
  strict: true,
  allowPositionals: false,
});

const config = await createGlobalConfig({
  projectDir: values.config as string,
  watchMode: values.watch as boolean,
  serve: values.serve as boolean,
});

const ecoPages = new EcoPagesBuilder({
  config,
  staticPageGenerator: new StaticPageGenerator(config),
  cssBuilder: new CssBuilder({ processor: new PostCssProcessor(), config }),
  scriptsBuilder: new ScriptsBuilder(config),
});

ecoPages.run();
