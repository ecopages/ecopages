/**
 * This module contains the ConfigBuilder class, which is used to build the EcoPagesAppConfig object.
 * @module
 */

import path from 'node:path';
import { ghtmlPlugin } from '../integrations/ghtml/ghtml.plugin.ts';
import { invariant } from '../utils/invariant.ts';

import type { EcoPagesAppConfig, IncludesTemplates, RobotsPreference } from '../internal-types.ts';
import type { IntegrationPlugin, PageMetadataProps } from '../public-types.ts';

export class ConfigBuilder {
  public config: EcoPagesAppConfig = {
    baseUrl: '',
    rootDir: '.',
    srcDir: 'src',
    pagesDir: 'pages',
    includesDir: 'includes',
    componentsDir: 'components',
    layoutsDir: 'layouts',
    publicDir: 'public',
    includesTemplates: {
      head: 'head.ghtml.ts',
      html: 'html.ghtml.ts',
      seo: 'seo.ghtml.ts',
    },
    error404Template: '404.ghtml.ts',
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
    scriptsExtensions: ['.script.ts', '.script.tsx'],
    defaultMetadata: {
      title: 'Ecopages',
      description: 'Ecopages',
    },
    templatesExt: [],
    absolutePaths: {
      componentsDir: '',
      distDir: '',
      includesDir: '',
      layoutsDir: '',
      pagesDir: '',
      projectDir: '',
      publicDir: '',
      srcDir: '',
      htmlTemplatePath: '',
      error404TemplatePath: '',
    },
  };

  setBaseUrl(baseUrl: string): this {
    this.config.baseUrl = baseUrl;
    return this;
  }

  setRootDir(rootDir: string): this {
    this.config.rootDir = rootDir;
    return this;
  }

  setSrcDir(srcDir: string): this {
    this.config.srcDir = srcDir;
    return this;
  }

  setPagesDir(pagesDir: string): this {
    this.config.pagesDir = pagesDir;
    return this;
  }

  setIncludesDir(includesDir: string): this {
    this.config.includesDir = includesDir;
    return this;
  }

  setComponentsDir(componentsDir: string): this {
    this.config.componentsDir = componentsDir;
    return this;
  }

  setLayoutsDir(layoutsDir: string): this {
    this.config.layoutsDir = layoutsDir;
    return this;
  }

  setPublicDir(publicDir: string): this {
    this.config.publicDir = publicDir;
    return this;
  }

  setIncludesTemplates(includesTemplates: IncludesTemplates): this {
    this.config.includesTemplates = includesTemplates;
    return this;
  }

  setError404Template(error404Template: string): this {
    this.config.error404Template = error404Template;
    return this;
  }

  setRobotsTxt(robotsTxt: { preferences: RobotsPreference }): this {
    this.config.robotsTxt = robotsTxt;
    return this;
  }

  setTailwind(tailwind: { input: string }): this {
    this.config.tailwind = tailwind;
    return this;
  }

  setIntegrations(integrations: IntegrationPlugin[]): this {
    this.config.integrations = integrations;
    return this;
  }

  setDistDir(distDir: string): this {
    this.config.distDir = distDir;
    return this;
  }

  setScriptsExtensions(scriptsExtensions: string[]): this {
    this.config.scriptsExtensions = scriptsExtensions;
    return this;
  }

  setDefaultMetadata(defaultMetadata: PageMetadataProps): this {
    this.config.defaultMetadata = {
      ...this.config.defaultMetadata,
      ...defaultMetadata,
    };
    return this;
  }

  createAbsolutePaths(config: EcoPagesAppConfig): this {
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

    const projectDir = config.rootDir;

    const absoluteSrcDir = path.resolve(projectDir, srcDir);
    const absoluteDistDir = path.resolve(projectDir, distDir);

    this.config.absolutePaths = {
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

    return this;
  }

  createIntegrationTemplatesExt(integrations: EcoPagesAppConfig['integrations']) {
    const integrationName = integrations.map((integration) => integration.name);
    const uniqueName = new Set(integrationName);

    invariant(integrationName.length === uniqueName.size, 'Integrations names must be unique');

    const integrationsExtensions = integrations.flatMap((integration) => integration.extensions);
    const uniqueExtensions = new Set(integrationsExtensions);

    invariant(integrationsExtensions.length === uniqueExtensions.size, 'Integrations extensions must be unique');

    this.config.templatesExt = integrationsExtensions;
  }

  async build(): Promise<EcoPagesAppConfig> {
    if (!this.config.baseUrl) {
      throw new Error('[ecopages] baseUrl is required');
    }

    if (!this.config.integrations.some((integration) => integration.name === 'ghtml')) {
      this.config.integrations.push(ghtmlPlugin());
    }

    this.createAbsolutePaths(this.config);
    this.createIntegrationTemplatesExt(this.config.integrations);

    globalThis.ecoConfig = this.config;

    return this.config;
  }
}
