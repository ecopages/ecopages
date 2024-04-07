import { $ } from "bun";
import path from "node:path";
import { exec } from "node:child_process";
import { FileUtils } from "@/utils/file-utils";
import { ScriptsBuilder } from "@/build/scripts-builder";
import { CssBuilder } from "@/build/css-builder";
import { createWatcherSubscription } from "@/build/watcher";
import { createStaticContentServer } from "@/server/sc-server";
import { createFileSystemServer } from "@/server/fs-server";
import type { EcoPagesConfig } from "@types";
import type { StaticPageGenerator } from "./static-page-generator";
import "@/global/console";

export class AppBuilder {
  config: EcoPagesConfig;
  staticPageGenerator: StaticPageGenerator;
  cssBuilder: CssBuilder;
  scriptsBuilder: ScriptsBuilder;

  constructor({
    config,
    staticPageGenerator,
    cssBuilder,
    scriptsBuilder,
  }: {
    config: EcoPagesConfig;
    staticPageGenerator: StaticPageGenerator;
    cssBuilder: CssBuilder;
    scriptsBuilder: ScriptsBuilder;
  }) {
    this.config = config;
    this.staticPageGenerator = staticPageGenerator;
    this.cssBuilder = cssBuilder;
    this.scriptsBuilder = scriptsBuilder;
  }

  prepareDistDir() {
    FileUtils.ensureFolderExists(this.config.distDir, true);
  }

  copyPublicDir() {
    const { srcDir, publicDir, distDir } = this.config;
    FileUtils.copyDirSync(path.join(srcDir, publicDir), path.join(distDir, publicDir));
  }

  execTailwind({
    minify,
    watch,
    input,
    output,
  }: {
    minify: boolean;
    watch: boolean;
    input: string;
    output: string;
  }) {
    exec(
      `bunx tailwindcss -i ${input} -o ${output} ${watch ? "--watch" : ""} ${
        minify ? "--minify" : ""
      }`
    );
  }

  private async runDevServer() {
    const { server } = await createFileSystemServer();
    // await $`clear`;
    console.log(`[eco-pages] Server running at http://localhost:${server.port}`);
  }

  async serve() {
    await this.runDevServer();
  }

  async watch() {
    this.runDevServer();

    const subscription = await createWatcherSubscription();

    process.on("SIGINT", async () => {
      await subscription.unsubscribe();
      process.exit(0);
    });
  }

  async buildStatic() {
    await this.staticPageGenerator.run();
    createStaticContentServer();
  }

  async run() {
    const { srcDir, globalDir, distDir, watchMode } = this.config;

    this.prepareDistDir();
    this.copyPublicDir();

    this.execTailwind({
      minify: !watchMode,
      watch: watchMode,
      input: `${srcDir}/${globalDir}/css/tailwind.css`,
      output: `${distDir}/${globalDir}/css/tailwind.css`,
    });

    await this.cssBuilder.build();
    await this.scriptsBuilder.build();

    if (this.config.watchMode) {
      return await this.watch();
    }

    FileUtils.gzipDirSync(distDir, ["css", "js"]);

    if (this.config.serve) {
      return await this.serve();
    }

    return await this.buildStatic();
  }
}
