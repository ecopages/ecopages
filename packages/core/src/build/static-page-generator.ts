import path from "path";
import { createFileSystemServer } from "@/server/fs-server";
import { FileUtils } from "@/utils/file-utils";
import type { EcoPagesConfig } from "@types";

export class StaticPageGenerator {
  config: EcoPagesConfig;

  constructor(config: EcoPagesConfig) {
    this.config = config;
  }

  generateRobotsTxt(): void {
    let data = "";
    const preferences = this.config.robotsTxt.preferences;

    for (let userAgent in preferences) {
      data += `user-agent: ${userAgent}\n`;
      preferences[userAgent].forEach((path) => {
        data += `disallow: ${path}\n`;
      });
      data += "\n";
    }

    try {
      FileUtils.writeFileSync(this.config.distDir + "/robots.txt", data);
    } catch (err) {
      console.error("Failed to write robots.txt file: ", err);
    }
  }

  async generateStaticPages() {
    const { router, server } = await createFileSystemServer();

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
          this.config.rootDir,
          this.config.distDir,
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

  async run() {
    this.generateRobotsTxt();
    await this.generateStaticPages();
  }
}
