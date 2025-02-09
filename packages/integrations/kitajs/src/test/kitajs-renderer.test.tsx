import { describe, expect, it } from 'bun:test';
import type { EcoComponent, EcoPage, HtmlTemplateProps } from '@ecopages/core';
import { ConfigBuilder } from '@ecopages/core';
import { KitaRenderer } from '../kitajs-renderer.ts';

const mockConfig = await new ConfigBuilder()
  .setIncludesTemplates({
    head: 'head.kita.tsx',
    html: 'html.kita.tsx',
    seo: 'seo.kita.tsx',
  })
  .setError404Template('404.kita.tsx')
  .setRobotsTxt({
    preferences: {
      '*': [],
      Googlebot: ['/public/'],
    },
  })
  .setTailwind({
    input: 'styles/tailwind.css',
  })
  .setIntegrations([])
  .setScriptsExtensions(['.script.ts', '.script.tsx'])
  .setDefaultMetadata({
    title: 'Ecopages',
    description: 'Ecopages',
  })
  .setBaseUrl('http://localhost:3000')
  .build();

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ headContent, children }) => {
  return `<html><head>${headContent}</head><body>${children}</body></html>`;
};

describe('KitaRenderer', () => {
  it('should render the page', async () => {
    const renderer = new KitaRenderer({ appConfig: mockConfig });

    renderer
      .render({
        params: {},
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
    const renderer = new KitaRenderer({ appConfig: mockConfig });

    renderer
      .render({
        params: {},
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
    const renderer = new KitaRenderer({ appConfig: mockConfig });

    const Page: EcoPage = async () => 'Hello World';

    renderer
      .render({
        params: {},
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
});
