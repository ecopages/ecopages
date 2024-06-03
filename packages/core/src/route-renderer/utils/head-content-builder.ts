import path from 'node:path';
import type { IntegrationDependencyConfig } from '@/main/integration-manager';
import type { EcoComponentDependencies, EcoPagesConfig } from '@types';
import { FileUtils } from '../../utils/file-utils.module';

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
   * @param {IntegrationDependencyConfig[]} integrationsDependencies
   * @param {string} integrationName
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
      const filePath = path.join(this.config.rootDir, this.config.distDir, stylesheet);
      const bunFile = await FileUtils.get(filePath);
      const fileContents = await bunFile.text();
      dependenciesString += `<style>${fileContents}</style>`;
    }

    for (const script of dependencies.scripts || []) {
      const filePath = path.join(this.config.rootDir, this.config.distDir, script);
      const bunFile = await FileUtils.get(filePath);
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
  async build({ dependencies, integrationName }: { dependencies?: EcoComponentDependencies; integrationName: string }) {
    const integrationsDependencies = this.config.integrationsDependencies;
    if (!dependencies && !integrationsDependencies) return;
    return await this.buildRequestDependencies({ integrationName, dependencies, integrationsDependencies });
  }
}
