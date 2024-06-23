import fs from 'node:fs';
import path from 'node:path';
import { appLogger } from '@/global/app-logger';
import { deepMerge } from '@/utils/deep-merge';
import { invariant } from '@/utils/invariant';
import type { EcoPagesConfig, EcoPagesConfigInput } from '@types';

export class AppConfigurator {
  config: EcoPagesConfig;

  static defaultConfig: Omit<EcoPagesConfig, 'baseUrl' | 'absolutePaths' | 'templatesExt'> = {
    adapter: process.versions.bun ? 'bun' : 'fastify',
    rootDir: '.',
    srcDir: 'src',
    pagesDir: 'pages',
    includesDir: 'includes',
    componentsDir: 'components',
    layoutsDir: 'layouts',
    publicDir: 'public',
    includesTemplates: {
      head: 'head.kita.tsx',
      html: 'html.kita.tsx',
      seo: 'seo.kita.tsx',
    },
    error404Template: '404.kita.tsx',
    robotsTxt: {
      preferences: {
        '*': [],
        Googlebot: ['/public/'],
      },
    },
    tailwind: {
      input: 'styles/tailwind.css',
    },
    integrations: [],
    integrationsDependencies: [],
    distDir: '.eco',
    scriptsExtensions: ['script.ts', 'script.tsx'],
    defaultMetadata: {
      title: 'Eco Pages',
      description: 'Eco Pages',
    },
  };

  getIntegrationTemplatesExt(integrations: EcoPagesConfig['integrations']) {
    const integrationName = integrations.map((integration) => integration.name);
    const uniqueName = new Set(integrationName);
    invariant(integrationName.length === uniqueName.size, 'Integrations names must be unique');

    const integrationsExtensions = integrations.flatMap((integration) => integration.extensions);
    const uniqueExtensions = new Set(integrationsExtensions);
    invariant(integrationsExtensions.length === uniqueExtensions.size, 'Integrations extensions must be unique');

    return integrationsExtensions;
  }

  constructor({
    projectDir,
    customConfig,
  }: {
    projectDir: string;
    customConfig: EcoPagesConfigInput;
  }) {
    invariant(customConfig.baseUrl, 'baseUrl is required in the config');
    invariant(customConfig.rootDir, 'rootDir is required in the config');

    const baseConfig = deepMerge(AppConfigurator.defaultConfig, customConfig);

    this.config = {
      ...baseConfig,
      templatesExt: this.getIntegrationTemplatesExt(baseConfig.integrations),
      absolutePaths: this.getAbsolutePaths(projectDir, baseConfig),
    };

    globalThis.ecoConfig = this.config;

    appLogger.debug('Config', this.config);
  }

  private getAbsolutePaths(
    projectDir: string,
    config: Omit<EcoPagesConfig, 'absolutePaths' | 'templatesExt'>,
  ): EcoPagesConfig['absolutePaths'] {
    const {
      srcDir,
      componentsDir,
      includesDir,
      layoutsDir,
      pagesDir,
      publicDir,
      distDir,
      includesTemplates,
      error404Template,
    } = config;

    const absoluteSrcDir = path.resolve(projectDir, srcDir);
    const absoluteDistDir = path.resolve(projectDir, distDir);

    return {
      projectDir: projectDir,
      srcDir: absoluteSrcDir,
      distDir: absoluteDistDir,
      componentsDir: path.join(absoluteSrcDir, componentsDir),
      includesDir: path.join(absoluteSrcDir, includesDir),
      layoutsDir: path.join(absoluteSrcDir, layoutsDir),
      pagesDir: path.join(absoluteSrcDir, pagesDir),
      publicDir: path.join(absoluteSrcDir, publicDir),
      htmlTemplatePath: path.join(absoluteSrcDir, includesDir, includesTemplates.html),
      error404TemplatePath: path.join(absoluteSrcDir, pagesDir, error404Template),
    };
  }

  async registerIntegrationsDependencies(integrationsDependencies: EcoPagesConfig['integrationsDependencies']) {
    this.config.integrationsDependencies = integrationsDependencies;
  }

  static async create({ projectDir }: { projectDir: string }): Promise<AppConfigurator> {
    if (!fs.existsSync(`${projectDir}/eco.config.ts`)) {
      throw new Error('eco.config.ts not found, please provide a valid config file.');
    }

    const { default: customConfig } = await import(`${projectDir}/eco.config.ts`);

    return new AppConfigurator({
      projectDir,
      customConfig,
    });
  }
}
