import { $ } from "bun";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { gzipDirectory } from "@/scripts/build/utils/gzip-directory";
import { generateRobotsTxt } from "@/scripts/robots/generate-robots-txt";
import { buildScripts } from "@/scripts/build/build-scripts";
import { buildPages } from "@/scripts/build/build-pages";
import { buildInitialCss } from "@/scripts/build/build-css";
import { createGlobalConfig } from "@/scripts/config/create-global-config";
import { createWatcherSubscription } from "@/scripts/build/watcher";
import { createDevServer } from "@/server/dev-server";
import type { EcoPagesConfig } from "@types";
import { createFsServer } from "@/server/fs-server";

/**
 * @class EcoPagesBuilder
 * @description
 * This class is responsible for building the eco-pages project.
 */
class EcoPagesBuilder {
  watchMode: boolean;
  projectDir?: string;
  declare config: Required<EcoPagesConfig>;

  constructor(args: string[]) {
    this.watchMode = args.includes("--watch");
    this.projectDir = args.find((arg) => arg.startsWith("--config="))?.split("=")[1];
  }

  /**
   * @method createGlobalConfig
   * @description
   * This method creates the global config for the project.
   */
  async createGlobalConfig() {
    this.config = await createGlobalConfig({
      projectDir: this.projectDir,
      watchMode: this.watchMode,
    });
  }

  /**
   * @method prepareDistDir
   * @description
   * This method prepares the dist directory for the project.
   * It creates the dist directory if it doesn't exist and removes the dist directory if it exists.
   * Then it creates the dist directory again.
   **/
  prepareDistDir() {
    if (!fs.existsSync(this.config.distDir)) {
      fs.mkdirSync(this.config.distDir);
    } else {
      fs.rmSync(this.config.distDir, { recursive: true });
      fs.mkdirSync(this.config.distDir);
    }
  }

  /**
   * @method copyPublicDir
   * @description
   * This method copies the public directory to the dist directory.
   */
  copyPublicDir() {
    fs.cpSync(
      path.join(this.config.srcDir, this.config.publicDir),
      path.join(this.config.distDir, this.config.publicDir),
      {
        recursive: true,
      }
    );
  }

  /**
   * @method generateRobotsTxt
   * @description
   * This method generates the robots.txt file for the project.
   */
  generateRobotsTxt() {
    generateRobotsTxt({
      preferences: this.config.robotsTxt.preferences,
      directory: this.config.distDir,
    });
  }

  /**
   * @method buildWatchMode
   * @description
   * This method builds the project in watch mode.
   * It watches the tailwindcss file and the pages directory.
   * It also runs the dev server.
   */
  async buildWatchMode() {
    const { srcDir, globalDir, distDir } = this.config;

    exec(
      `bunx tailwindcss -i ${srcDir}/${globalDir}/css/tailwind.css -o ${distDir}/${globalDir}/css/tailwind.css --watch --minify`
    );

    this.runDevServer();

    const subscription = await createWatcherSubscription();

    process.on("SIGINT", async () => {
      await subscription.unsubscribe();
      process.exit(0);
    });
  }

  /**
   * @method buildProdMode
   * @description
   * This method builds the project in production mode.
   * It minifies the tailwindcss file and gzips the dist directory.
   * It also runs the dev server.
   */
  async buildProdMode() {
    const { srcDir, globalDir, distDir } = this.config;

    exec(
      `bunx tailwindcss -i ${srcDir}/${globalDir}/css/tailwind.css -o ${distDir}/${globalDir}/css/tailwind.css --minify`
    );

    gzipDirectory(distDir);

    await this.generateStaticPages();

    createDevServer({ gzip: true });
  }

  async generateStaticPages() {
    const { router, server } = await createFsServer({ gzip: false });

    for (const route of Object.keys(router.routes)) {
      try {
        /**
         * @todo handle dynamic routes [slug] [...catchAll]
         */
        if (route.includes("[")) continue;

        const response = await fetch(route);

        if (!response.ok) {
          console.error(`Failed to fetch ${route}. Status: ${response.status}`);
          continue;
        }

        const filePath = path.join(
          globalThis.ecoConfig.rootDir,
          globalThis.ecoConfig.distDir,
          router.routes[route].pathname,
          "index.html"
        );

        await Bun.write(filePath, response);

        console.log(`Successfully fetched and saved ${route} to ${filePath}`);
      } catch (error) {
        console.error(`Error fetching or writing ${route}:`, error);
      }
    }

    server.stop();
  }

  /**
   * @method run
   * @description
   * This method runs the eco-pages builder.
   */
  async run() {
    await this.createGlobalConfig();

    this.prepareDistDir();
    this.copyPublicDir();
    this.generateRobotsTxt();

    await buildInitialCss();
    await buildScripts();
    // await buildPages();

    if (this.watchMode) {
      await this.buildWatchMode();
    } else {
      await this.buildProdMode();
    }
  }

  /**
   * @method runDevServer
   * @description
   * This method runs the dev server.
   * @param {boolean} gzip - Whether to gzip the dist directory or not.
   */
  private async runDevServer(gzip: boolean = !this.watchMode) {
    const { server } = await createFsServer({ gzip });
    await $`clear`;
    console.log(`[eco-pages] Server running at http://localhost:${server.port}`);
  }
}

const ecoPages = new EcoPagesBuilder(process.argv.slice(2));
ecoPages.run();
