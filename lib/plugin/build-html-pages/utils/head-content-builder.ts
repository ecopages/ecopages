import path from "path";
import Bun from "bun";
import type { EcoComponentDependencies, EcoPagesConfig } from "root/lib/eco-pages.types";

/**
 * Build the head content for the html pages.
 * It will provide the dependencies for the html head.
 * It is possible to build the dependencies as request or inline.
 * @class HeadContentBuilder
 * @param {EcoPagesConfig} config
 */
export class HeadContentBuilder {
  config: EcoPagesConfig;

  constructor(config: EcoPagesConfig) {
    this.config = config;
  }

  /**
   * Build the request dependencies.
   * It will build the dependencies as request.
   * @param {EcoComponentDependencies} dependencies
   */
  async buildRequestDepenendencies(dependencies: EcoComponentDependencies) {
    let dependenciesString = "";

    if (dependencies.stylesheets) {
      dependenciesString += dependencies.stylesheets
        .map((stylesheet) => `<link rel="stylesheet" href="${stylesheet}" />`)
        .join("");
    }

    if (dependencies.scripts) {
      dependenciesString += dependencies.scripts
        .map((script) => `<script defer type="module" src="${script}"></script>`)
        .join("");
    }

    return dependenciesString;
  }

  /**
   * Build the inline dependencies.
   * It will build the dependencies as inline.
   * @param {EcoComponentDependencies} dependencies
   */
  async buildInlineDependencies(dependencies: EcoComponentDependencies) {
    let dependenciesString = "";

    for (const stylesheet of dependencies.stylesheets || []) {
      const filePath = path.join(this.config.rootDir, this.config.distDir, stylesheet);
      const bunFile = Bun.file(filePath);
      const fileContents = await bunFile.text();
      dependenciesString += `<style>${fileContents}</style>`;
    }

    for (const script of dependencies.scripts || []) {
      const filePath = path.join(this.config.rootDir, this.config.distDir, script);
      const bunFile = Bun.file(filePath);
      const fileContents = await bunFile.text();
      dependenciesString += `<script defer type="module">${fileContents}</script>`;
    }

    return dependenciesString;
  }

  /**
   * Build the head content.
   * It will build the head content based on the dependencies.
   * @param {EcoComponentDependencies} dependencies
   */
  async build({ dependencies }: { dependencies?: EcoComponentDependencies }) {
    if (!dependencies) return;

    return await this.buildRequestDepenendencies(dependencies);
  }
}
