import type { LayoutProps } from '@ecopages/core';
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ApiField } from '@/components/api-field/api-field';
import { Banner } from '@/components/banner/banner';
import { CodeTabs } from '@/components/code-tabs';
import { docsNav, serializeDocsPaginationData } from '@/lib/content-nav';
import { BaseLayout } from '@/layouts/base-layout';
import { resolveDocsBreadcrumb } from '@/lib/docs/resolve-docs-breadcrumb';
import { DocsBar } from './docs-bar';
import { DocsPagination } from './components/docs-pagination';
import { DocsSidebar } from './components/navigation';
import { DocsToc } from './components/toc';

type DocsLayoutPageProps = {
	section?: string;
	slug?: string;
};

type DocsLayoutRenderProps = LayoutProps<JsxRenderable> & DocsLayoutPageProps;

type ShellLayoutProps = {
	class?: string;
	showBurger?: boolean;
	children?: JsxRenderable;
};

const paginationData = serializeDocsPaginationData(docsNav);
const ShellLayout = BaseLayout as (props: ShellLayoutProps) => JsxRenderable;

export const DocsLayout = eco.layout<JsxRenderable>({
	dependencies: {
		stylesheets: ['./docs-layout.css'],
		components: [BaseLayout, ApiField, Banner, CodeTabs, DocsBar, DocsSidebar, DocsToc, DocsPagination],
	},
	render: ({ children, section, slug }: DocsLayoutRenderProps) => {
		const llmUrl = section && slug ? `/docs-llm/${section}/${slug}.md` : undefined;
		const crumbs = section && slug ? resolveDocsBreadcrumb(docsNav, section, slug) : [];

		return (
			<ShellLayout class="docs-layout" showBurger={true}>
				<script type="application/json" id="docs-pagination-data" safe>
					{paginationData}
				</script>
				<DocsSidebar />
				<div class="docs-layout__content">
					<DocsBar crumbs={crumbs} llmUrl={llmUrl} />
					<div class="prose">{children}</div>
					<DocsPagination />
				</div>
				<DocsToc />
			</ShellLayout>
		);
	},
});

export default DocsLayout;
