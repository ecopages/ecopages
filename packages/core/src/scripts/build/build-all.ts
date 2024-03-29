import { $ } from "bun";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { gzipDirectory } from "@/scripts/build/utils/gzip-directory";
import { generateRobotsTxt } from "@/scripts/robots/generate-robots-txt";
import { buildScripts } from "@/scripts/build/build-scripts";
import { buildInitialCss } from "@/scripts/build/build-css";
import { createGlobalConfig } from "@/scripts/config/create-global-config";
import { createWatcherSubscription } from "@/scripts/build/watcher";
import { createDevServer } from "@/server/dev-server";
import type { EcoPagesConfig } from "@types";
import { createFsServer } from "@/server/fs-server";
import { FileUtils } from "@/utils/file-utils";

/**
 * @class EcoPagesBuilder
 * @description
 * This class is responsible for building the eco-pages project.
 */
class EcoPagesBuilder {
  watchMode: boolean;
  projectDir: string;
  declare config: Required<EcoPagesConfig>;

  constructor(args: string[]) {
    this.watchMode = args.includes("--watch");
    this.projectDir = process.cwd();
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

    createDevServer();
  }

  async generateStaticPages() {
    const { router, server } = await createFsServer();

    const routes = Object.keys(router.routes).filter((route) => !route.includes("["));

    for (const route of routes) {
      try {
        const response = await fetch(route);

        if (!response.ok) {
          console.error(`Failed to fetch ${route}. Status: ${response.status}`);
          continue;
        }

        let pathname = router.routes[route].pathname;

        if (router.routes[route].pathname.includes("[")) {
          pathname = route.replace(router.origin, "");
        }

        const filePath = path.join(
          globalThis.ecoConfig.rootDir,
          globalThis.ecoConfig.distDir,
          pathname,
          "index.html"
        );

        const contents = await response.text();

        await FileUtils.write(filePath, contents);
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
   */
  private async runDevServer() {
    const { server } = await createFsServer();
    await $`clear`;
    console.log(`[eco-pages] Server running at http://localhost:${server.port}`);
  }
}

const ecoPages = new EcoPagesBuilder(process.argv.slice(2));
ecoPages.run();
