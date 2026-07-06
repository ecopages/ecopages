import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsSiteContent } from '@/content/docs/content';
import { DocsBar } from '@/docs-kit/components/docs-bar';
import { defineDocsKit } from '@/docs-kit/config';
import { BaseLayout } from '@/layouts/base-layout';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = moduleDir.includes(`${path.sep}.eco${path.sep}`)
	? path.resolve(moduleDir, '../..')
	: path.resolve(moduleDir, '..');

defineDocsKit({
	rootDir: appRoot,
	content: docsSiteContent,
	mdxComponents: {},
	shellLayout: BaseLayout,
	layoutComponents: [BaseLayout, DocsBar],
	strictImageImports: false,
});
