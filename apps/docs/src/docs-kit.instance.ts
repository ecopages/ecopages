import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiField } from '@/components/api-field/api-field';
import { Banner, BannerTitle } from '@/components/banner/banner';
import { CodeTabs } from '@/components/code-tabs';
import { BaseLayout } from '@/layouts/base-layout';
import { DocsBar } from '@/lib/docs-kit/components/docs-bar';
import { defineDocsKit } from '@/lib/docs-kit/config';
import { DocsPagination } from '@/lib/docs-kit/layout/docs-layout/components/docs-pagination';
import { DocsSidebar } from '@/lib/docs-kit/layout/docs-layout/components/navigation';
import { DocsToc } from '@/lib/docs-kit/layout/docs-layout/components/toc';
import { buildDocsSiteContent } from '@/lib/docs-kit/content/build-docs-site-content';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = moduleDir.includes(`${path.sep}.eco${path.sep}`)
	? path.resolve(moduleDir, '../..')
	: path.resolve(moduleDir, '..');
const contentRoot = path.join(appRoot, 'src', 'content', 'docs');

defineDocsKit({
	rootDir: appRoot,
	contentRoot,
	content: buildDocsSiteContent(),
	mdxComponents: {
		Banner,
		BannerTitle,
		ApiField,
		CodeTabs,
	},
	shellLayout: BaseLayout,
	layoutComponents: [BaseLayout, ApiField, Banner, CodeTabs, DocsBar, DocsSidebar, DocsToc, DocsPagination],
	strictImageImports: process.env.NODE_ENV !== 'production',
});
