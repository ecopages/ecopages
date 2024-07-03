import path from 'node:path';
import type { EcoPagesAppConfig, IntegrationDependencyConfig } from '../../internal-types.ts';
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

  constructor(appConfig: EcoPagesAppConfig) {
    this.appConfig = appConfig;
  }

  /**
   * Build the request dependencies.
   * It will build the dependencies as request.
   * @param {string} options.integrationName
   * @param {EcoComponentDependencies} options.dependencies
   * @param {IntegrationDependencyConfig[]} options.integrationsDependencies
   */
  async buildRequestDependencies({
    integrationName,
    dependencies,
    integrationsDependencies,
  }: {
    integrationName: string;
    dependencies?: EcoComponentDependencies;
    integrationsDependencies?: IntegrationDependencyConfig[];
  }) {
    let dependenciesString = '';

    if (integrationsDependencies) {
      for (const dependency of integrationsDependencies) {
        if (dependency.integration !== integrationName) continue;
        if (dependency.kind === 'stylesheet') {
          dependenciesString += `<link rel="stylesheet" href="${dependency.srcUrl}" />`;
        } else if (dependency.kind === 'script') {
          dependenciesString += `<script defer type="module" src="${dependency.srcUrl}"></script>`;
        }
      }
    }

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
  async build({ dependencies, integrationName }: { dependencies?: EcoComponentDependencies; integrationName: string }) {
    const integrationsDependencies = this.appConfig.integrationsDependencies;
    if (!dependencies && !integrationsDependencies) return;
    return await this.buildRequestDependencies({ integrationName, dependencies, integrationsDependencies });
  }
}
