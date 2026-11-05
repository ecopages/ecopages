import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, test, vi } from 'vitest';

const templatesRoot = path.resolve(import.meta.dirname, '../templates');

const seoFiles = [
	'jsx/src/includes/seo.tsx',
	'radiant/src/includes/seo.tsx',
	'react/src/includes/seo.tsx',
	'react-shadcn/src/includes/seo.tsx',
	'react-better-auth/src/includes/seo.tsx',
	'blog-jsx/src/includes/seo.tsx',
	'blog-react/src/includes/seo.tsx',
	'lit-jsx/src/includes/seo.kita.tsx',
];

const configFiles = [
	'jsx/eco.config.ts',
	'html/eco.config.ts',
	'radiant/eco.config.ts',
	'react/eco.config.ts',
	'react-shadcn/eco.config.ts',
	'blog-jsx/eco.config.ts',
	'blog-react/eco.config.ts',
	'docs-starter/eco.config.ts',
	'blog-jsx/app.ts',
	'blog-react/app.ts',
];

const read = (relativePath: string) => readFileSync(path.join(templatesRoot, relativePath), 'utf8');

describe('official template contracts', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test('counters serialize count as an attribute', () => {
		for (const file of ['jsx/src/components/counter.tsx', 'radiant/src/components/radiant-counter.tsx']) {
			const source = read(file);
			assert.doesNotMatch(source, /<[a-z]+-counter count=\{/u, `${file} binds count as a property`);
			assert.match(source, /<[a-z]+-counter attr:count=\{count\}/u, `${file} must use attr:count`);
		}
	});

	test('canonical links resolve against the site origin helper, not ECOPAGES_BASE_URL concatenation', () => {
		for (const file of seoFiles) {
			const source = read(file);
			assert.doesNotMatch(source, /process\.env\.ECOPAGES_BASE_URL\}\//u, `${file} concatenates the raw env`);
			assert.match(source, /absoluteUrl\(url\)/u, `${file} must build canonicals with absoluteUrl`);
		}
	});

	test('site-origin helpers join origin and pathname with exactly one slash', async () => {
		vi.stubEnv('ECOPAGES_BASE_URL', 'https://example.com/');
		for (const file of seoFiles) {
			const helperPath = path.join(templatesRoot, file.split('/')[0]!, 'src/lib/site-origin.ts');
			assert.ok(existsSync(helperPath), `${helperPath} is missing`);
			vi.resetModules();
			const helper = (await import(/* @vite-ignore */ pathToFileURL(helperPath).href)) as {
				absoluteUrl: (pathname: string) => string;
			};
			assert.equal(helper.absoluteUrl('/course'), 'https://example.com/course');
			assert.equal(helper.absoluteUrl('course'), 'https://example.com/course');
		}
	});

	test('app roots come from the working directory, not the bundled module location', () => {
		for (const file of configFiles) {
			assert.doesNotMatch(
				read(file),
				/import\.meta\.dirname/u,
				`${file} derives the app root from import.meta.dirname`,
			);
		}
	});
});
