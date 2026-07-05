import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DocsBar } from '@/docs-kit/components/docs-bar';
import { defineDocsKit } from '@/docs-kit/config';
import { docsManifestConfig } from '@/docs-kit/manifest/docs-manifest.config';
import { BaseLayout } from '@/layouts/base-layout';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

defineDocsKit({
	rootDir: appRoot,
	manifest: docsManifestConfig,
	mdxComponents: {},
	shellLayout: BaseLayout,
	layoutComponents: [BaseLayout, DocsBar],
	sectionIcons: {},
	strictImageImports: false,
});
