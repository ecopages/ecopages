import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JsxRenderable } from '@ecopages/jsx';
import { ApiField } from '@/components/api-field/api-field';
import { Banner, BannerTitle } from '@/components/banner/banner';
import { CodeTabs } from '@/components/code-tabs';
import { BaseLayout } from '@/layouts/base-layout';
import { DocsBar } from '@/lib/docs-kit/components/docs-bar';
import { defineDocsKit } from '@/lib/docs-kit/config';
import { DocsPagination } from '@/lib/docs-kit/layout/docs-layout/components/docs-pagination';
import { DocsSidebar } from '@/lib/docs-kit/layout/docs-layout/components/navigation';
import { DocsToc } from '@/lib/docs-kit/layout/docs-layout/components/toc';
import { docsManifestConfig } from '@/lib/docs-kit/manifest/docs-manifest.config';
import { docsSectionIcons } from '@/docs-section-icons';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

defineDocsKit({
	rootDir: appRoot,
	manifest: docsManifestConfig,
	mdxComponents: {
		Banner,
		BannerTitle,
		ApiField,
		CodeTabs,
	},
	shellLayout: BaseLayout,
	layoutComponents: [BaseLayout, ApiField, Banner, CodeTabs, DocsBar, DocsSidebar, DocsToc, DocsPagination],
	sectionIcons: docsSectionIcons as Record<string, JsxRenderable>,
	strictImageImports: process.env.NODE_ENV !== 'production',
});
