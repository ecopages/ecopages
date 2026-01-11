import { describe, expect, it } from 'bun:test';
import HtmlTemplate from '../../../__fixtures__/app/src/includes/html.ghtml.js';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { GhtmlRenderer } from './ghtml-renderer.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

const metadata = {
	title: 'Ecopages',
	description: 'Ecopages',
};

const pageBody = '<body>Hello World</body>';

const rendererContext = {
	appConfig,
} as unknown as any;

describe('GhtmlRenderer', () => {
	it('should render the page', async () => {
		const renderer = new GhtmlRenderer(rendererContext);

		renderer
			.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				metadata,
				Page: async () => pageBody,
				resolvedDependencies: [],
				HtmlTemplate,
			})
			.then((body) => {
				expect(body).toInclude('<!DOCTYPE html>');
				expect(body).toInclude('<body>Hello World</body>');
				expect(body).toInclude('<title>Ecopages</title>');
				expect(body).toInclude('<meta name="description" content="Ecopages" />');
			});
	});

	it('should throw an error if the page fails to render', async () => {
		const renderer = new GhtmlRenderer(rendererContext);

		renderer
			.render({
				params: {},
				query: {},
				props: {},
				file: 'file',
				resolvedDependencies: [],
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
});
