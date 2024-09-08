import { describe, expect, it } from 'bun:test';
import type { EcoComponent, EcoPage, HtmlTemplateProps } from '@ecopages/core';
import { GhtmlRenderer } from './ghtml-renderer.ts';

const mockConfig = {
  rootDir: '.',
  srcDir: 'src',
  pagesDir: 'pages',
  includesDir: 'includes',
  componentsDir: 'components',
  layoutsDir: 'layouts',
  publicDir: 'public',
  includesTemplates: {
    head: 'head.ghtml.tsx',
    html: 'html.ghtml.tsx',
    seo: 'seo.ghtml.tsx',
  },
  error404Template: '404.ghtml.tsx',
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
    title: 'Eco Pages',
    description: 'Eco Pages',
  },
  baseUrl: 'http://localhost:3000',
  templatesExt: ['.tsx'],
  absolutePaths: {
    projectDir: '.',
    srcDir: 'src',
    distDir: '.eco',
    componentsDir: 'src/components',
    includesDir: 'src/includes',
    layoutsDir: 'src/layouts',
    pagesDir: 'src/pages',
    publicDir: 'src/public',
    htmlTemplatePath: 'src/includes/html.kita.tsx',
    error404TemplatePath: 'src/pages/404.kita.tsx',
  },
};

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ headContent, children }) => {
  return `<html><head>${headContent}</head><body>${children}</body></html>`;
};

describe('GhtmlRenderer', () => {
  it('should render the page', async () => {
    const renderer = new GhtmlRenderer(mockConfig);

    renderer
      .render({
        params: {},
        appConfig: mockConfig,
        query: {},
        props: {},
        file: 'file',
        metadata: {
          title: 'Hello World',
          description: 'Hello World',
        },
        Page: async () => 'Hello World',
        HtmlTemplate,
      })
      .then((body) => {
        expect(body).toBe('<!DOCTYPE html><html><head></head><body>Hello World</body></html>');
      });
  });

  it('should throw an error if the page fails to render', async () => {
    const renderer = new GhtmlRenderer(mockConfig);

    renderer
      .render({
        params: {},
        appConfig: mockConfig,
        query: {},
        props: {},
        file: 'file',
        metadata: {
          title: 'Hello World',
          description: 'Hello World',
        },
        Page: async () => {
          throw new Error('Page failed to render');
        },
        HtmlTemplate,
      })
      .catch((error) => {
        expect(error.message).toBe('[ecopages] Error rendering page: Error: Page failed to render');
      });
  });

  it('should include page dependencies in head content', async () => {
    const renderer = new GhtmlRenderer(mockConfig);

    const Page: EcoPage = async () => 'Hello World';

    renderer
      .render({
        params: {},
        appConfig: mockConfig,
        query: {},
        props: {},
        file: 'file',
        metadata: {
          title: 'Hello World',
          description: 'Hello World',
        },
        dependencies: {
          scripts: ['my-script.js'],
          stylesheets: ['my-dependency.css'],
        },
        Page,
        HtmlTemplate,
      })
      .then((body) => {
        expect(body).toBe(
          '<!DOCTYPE html><html><head><link rel="stylesheet" href="my-dependency.css" /><script defer type="module" src="my-script.js"></script></head><body>Hello World</body></html>',
        );
      });
  });

  it('should include page metadata in head content', async () => {
    const renderer = new GhtmlRenderer(mockConfig);

    const Page: EcoPage = async () => 'Hello World';

    renderer
      .render({
        params: {},
        appConfig: mockConfig,
        query: {},
        props: {},
        file: 'file',
        metadata: {
          title: 'Hello World',
          description: 'Hello World',
        },
        Page,
        HtmlTemplate,
      })
      .then((body) => {
        expect(body).toBe(
          '<!DOCTYPE html><html><head><title>Hello World</title><meta name="description" content="Hello World" /></head><body>Hello World</body></html>',
        );
      });
  });
});
