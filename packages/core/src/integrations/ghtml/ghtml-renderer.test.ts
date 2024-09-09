import { describe, expect, it } from 'bun:test';
import type { EcoPage } from '@ecopages/core';
import HtmlTemplate from 'fixtures/app/src/includes/html.ghtml.ts';
import { FIXTURE_APP_PROJECT_DIR } from 'fixtures/constants.ts';
import { AppConfigurator } from 'src/main/app-configurator.ts';
import { GhtmlRenderer } from './ghtml-renderer.ts';

const appConfigurator = await AppConfigurator.create({
  projectDir: FIXTURE_APP_PROJECT_DIR,
});

const metadata = {
  title: 'Eco Pages',
  description: 'Eco Pages',
};

const pageBody = '<body>Hello World</body>';

describe('GhtmlRenderer', () => {
  it('should render the page', async () => {
    const renderer = new GhtmlRenderer(appConfigurator.config);

    renderer
      .render({
        params: {},
        query: {},
        props: {},
        file: 'file',
        metadata,
        Page: async () => pageBody,
        HtmlTemplate,
      })
      .then((body) => {
        expect(body).toInclude('<!DOCTYPE html>');
        expect(body).toInclude('<body>Hello World</body>');
        expect(body).toInclude('<title>Eco Pages</title>');
        expect(body).toInclude('<meta name="description" content="Eco Pages" />');
      });
  });

  it('should throw an error if the page fails to render', async () => {
    const renderer = new GhtmlRenderer(appConfigurator.config);

    renderer
      .render({
        params: {},
        query: {},
        props: {},
        file: 'file',
        metadata,
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
    const renderer = new GhtmlRenderer(appConfigurator.config);

    const Page: EcoPage = async () => pageBody;

    renderer
      .render({
        params: {},
        query: {},
        props: {},
        file: 'file',
        metadata,
        dependencies: {
          scripts: ['my-script.js'],
          stylesheets: ['my-dependency.css'],
        },
        Page,
        HtmlTemplate,
      })
      .then((body) => {
        expect(body).toInclude('<link rel="stylesheet" href="my-dependency.css" />');
        expect(body).toInclude('<script defer type="module" src="my-script.js"></script>');
      });
  });
});
