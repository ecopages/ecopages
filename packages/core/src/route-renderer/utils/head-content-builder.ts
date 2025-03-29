import path from 'node:path';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { EcoComponentDependencies } from '../../public-types.ts';
import { FileUtils } from '../../utils/file-utils.module.ts';

/**
 * Build the head content for the html pages.
 * It will provide the dependencies for the html head.
 * It is possible to build the dependencies as request or inline.
 * @class HeadContentBuilder
 * @param {EcoPagesAppConfig} config
 */
export class HeadContentBuilder {
  appConfig: EcoPagesAppConfig;

  constructor({
    appConfig,
  }: {
    appConfig: EcoPagesAppConfig;
  }) {
    this.appConfig = appConfig;
  }

  /**
   * Build the request dependencies.
   * It will build the dependencies as request.
   * @param {string} options.integrationName
   * @param {EcoComponentDependencies} options.dependencies
   */
  async buildRequestDependencies({
    integrationName,
    dependencies,
  }: {
    integrationName: string;
    dependencies?: EcoComponentDependencies;
  }) {
    let dependenciesString = '';

    if (dependencies?.stylesheets) {
      dependenciesString += dependencies.stylesheets
        .map((stylesheet) => `<link rel="stylesheet" href="${stylesheet}" />`)
        .join('');
    }

    if (dependencies?.scripts) {
      dependenciesString += dependencies.scripts
        .map((script) => `<script defer type="module" src="${script}"></script>`)
        .join('');
    }

    return dependenciesString;
  }

  /**
   * Build the inline dependencies.
   * It will build the dependencies as inline.
   * @param {EcoComponentDependencies} dependencies
   */
  async buildInlineDependencies(dependencies: EcoComponentDependencies) {
    let dependenciesString = '';

    for (const stylesheet of dependencies.stylesheets || []) {
      const filePath = path.join(this.appConfig.rootDir, this.appConfig.distDir, stylesheet);
      const fileContents = FileUtils.getFileAsBuffer(filePath).toString();
      dependenciesString += `<style>${fileContents}</style>`;
    }

    for (const script of dependencies.scripts || []) {
      const filePath = path.join(this.appConfig.rootDir, this.appConfig.distDir, script);
      const fileContents = FileUtils.getFileAsBuffer(filePath).toString();
      dependenciesString += `<script defer type="module">${fileContents}</script>`;
    }

    return dependenciesString;
  }

  /**
   * Build the head content.
   * It will build the head content based on the dependencies.
   * @param {EcoComponentDependencies} dependencies
   */
  async build({
    dependencies,
    integrationName,
  }: {
    dependencies?: EcoComponentDependencies;
    integrationName: string;
  }) {
    return await this.buildRequestDependencies({
      integrationName,
      dependencies,
    });
  }
}
