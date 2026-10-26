import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'vitest';
import {
	collectViewIntegrations,
	createViewReference,
	findViewOwner,
	isExemptFromViewReference,
	isIgnoredViewPath,
	isViewReference,
	viewExtensionFilter,
	viewReferenceModuleSource,
} from './view-reference.ts';

describe('view references', () => {
	it('returns the same object for two imports of one file', () => {
		const filePath = path.join('/tmp', 'shared-view.kita.tsx');
		const first = createViewReference(filePath, 'kitajs');
		const second = createViewReference(filePath, 'kitajs');

		assert.equal(first, second);
		assert.equal(isViewReference(first), true);
		assert.equal(first.filePath, path.resolve(filePath));
		assert.equal(first.config.identity.integration, 'kitajs');
	});

	it('does not treat a loaded component as a view reference', () => {
		assert.equal(isViewReference({ config: { identity: { file: '/tmp/view.kita.tsx' } } }), false);
		assert.equal(
			isViewReference(() => '<p></p>'),
			false,
		);
	});

	it('adds the html-pages Integration when none claims .html', () => {
		const integrations = collectViewIntegrations([{ name: 'kitajs', extensions: ['.kita.tsx'] }]);
		assert.deepEqual(
			integrations.map((integration) => integration.name),
			['kitajs', 'html-pages'],
		);
		assert.equal(findViewOwner(integrations, '/app/src/views/page.kita.tsx')?.name, 'kitajs');
		assert.equal(findViewOwner(integrations, '/app/src/pages/404.html')?.name, 'html-pages');
	});

	it('ignores node_modules and unmatched files', () => {
		const integrations = collectViewIntegrations([{ name: 'kitajs', extensions: ['.kita.tsx'] }]);
		assert.equal(isIgnoredViewPath('/app/node_modules/@acme/ui/button.kita.tsx'), true);
		assert.equal(findViewOwner(integrations, '/app/node_modules/@acme/ui/button.kita.tsx'), undefined);
		assert.equal(findViewOwner(integrations, '/app/src/handlers/api.ts'), undefined);
	});

	it('does not rewrite the server entry, config, or imports from outside the app', () => {
		const entryPath = '/app/app.ts';
		const viewPath = '/app/src/views/post.kita.tsx';

		assert.equal(isExemptFromViewReference(entryPath, { entryPath }), true);
		assert.equal(isExemptFromViewReference('/app/eco.config.ts'), true);
		assert.equal(
			isExemptFromViewReference(viewPath, {
				entryPath,
				importerPath: null,
				appRoot: '/app',
				requireAppImporter: true,
			}),
			true,
		);
		assert.equal(
			isExemptFromViewReference(viewPath, {
				entryPath,
				importerPath: '/packages/core/src/build/server/page-module-import.service.ts',
				appRoot: '/app',
				requireAppImporter: true,
			}),
			true,
		);
		assert.equal(
			isExemptFromViewReference(viewPath, {
				entryPath,
				importerPath: '/app/app.ts',
				appRoot: '/app',
				requireAppImporter: true,
			}),
			false,
		);
		assert.equal(
			isExemptFromViewReference('/packages/core/src/adapters/create-app.ts', {
				entryPath,
				appRoot: '/app',
			}),
			true,
		);
	});

	it('writes a module that constructs the reference for the resolved file', () => {
		const filePath = '/app/src/views/post.kita.tsx';
		const source = viewReferenceModuleSource(filePath, 'kitajs');
		assert.match(source, /createViewReference/);
		assert.match(source, /@ecopages\/core\/view-reference/);
		assert.equal(viewExtensionFilter(['.kita.tsx', '.html']).test('/app/src/views/post.kita.tsx'), true);
		assert.equal(viewExtensionFilter(['.kita.tsx']).test('/app/src/views/post.tsx'), false);
	});
});
