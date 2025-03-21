import { describe, expect, it } from 'bun:test';
import exp from 'node:constants';
import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { renderToReadableStream } from 'react-dom/server';
import { ReactRenderer } from '../react-renderer';
import { ErrorPage } from './fixture/error-page';
import { Page } from './fixture/test-page';

const mockConfig = await new ConfigBuilder()
  .setIncludesTemplates({
    head: 'head.tsx',
    html: 'html.tsx',
    seo: 'seo.tsx',
  })
  .setError404Template('404.tsx')
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

const HtmlTemplate = ({ headContent, children }: { headContent?: React.ReactNode; children?: React.ReactNode }) => (
  <html lang="en">
    <head>{headContent}</head>
    <body>{children}</body>
  </html>
);

const pageFilePath = path.resolve(__dirname, 'fixture/test-page.tsx');
const errorPageFile = path.resolve(__dirname, 'fixture/error-page.tsx');

const renderer = new ReactRenderer({ appConfig: mockConfig });

describe('ReactRenderer', () => {
  it('should render the page', async () => {
    const body = await renderer.render({
      params: {},
      query: {},
      props: {},
      file: pageFilePath,
      metadata: {
        title: 'Test Page',
        description: 'Test Description',
      },
      dependencies: {
        scripts: [],
        stylesheets: [],
      },
      Page,
      HtmlTemplate,
    });

    const text = await new Response(body as BodyInit).text();
    expect(text).toContain('<div>Hello World</div>');
  });

  it('should throw an error if the page fails to render', async () => {
    expect(
      renderer.render({
        params: {},
        query: {},
        props: {},
        file: errorPageFile,
        metadata: {
          title: 'Error Page',
          description: 'Error Description',
        },
        dependencies: {
          scripts: [],
          stylesheets: [],
        },
        Page: ErrorPage,
        HtmlTemplate,
      }),
    ).rejects.toThrow('Failed to render component');
  });

  it('should include page dependencies in head content', async () => {
    const body = await renderer.render({
      params: {},
      query: {},
      props: {},
      file: pageFilePath,
      metadata: {
        title: 'Dependency Test',
        description: 'Test Description',
      },
      dependencies: {
        scripts: ['test-script.js'],
        stylesheets: ['test-style.css'],
      },
      Page,
      HtmlTemplate,
    });

    const text = await new Response(body as BodyInit).text();
    expect(text).toContain('test-script.js');
    expect(text).toContain('test-style.css');
    expect(text).toContain('<link');
    expect(text).toContain('<script');
    expect(text).toContain('type="importmap"');
    expect(text).toContain('react-dom/client');
    expect(text).toContain('react/jsx-runtime');
    expect(text).toContain('react');
    expect(text).toContain('__integrations__');
  });
});
