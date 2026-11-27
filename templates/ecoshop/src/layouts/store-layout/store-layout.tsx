import { eco, type LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiAlert, RuiAlertDescription } from '@ecopages/radiant-ui/alert';
import { RuiToaster } from '@ecopages/radiant-ui/toast';
import { StoreAgentToolsHost } from '@/components/agent-tools/store-agent-tools';
import { CartLink } from '@/components/cart-count/cart-count';
import { Logo } from '@/components/logo/logo';
import { SearchForm } from '@/components/search-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { usesDemoCatalog } from '@/lib/commerce/provider.server';
import { POLICY_HANDLES, storePaths } from '@/lib/store-urls';
import './store-layout.css';

const FOOTER_POLICIES: Array<[string, string]> = [
	[POLICY_HANDLES.shipping, 'Shipping'],
	[POLICY_HANDLES.refund, 'Returns'],
	[POLICY_HANDLES.privacy, 'Privacy'],
	[POLICY_HANDLES.terms, 'Terms'],
];

export const StoreLayout = eco.layout<JsxRenderable, LayoutProps<JsxRenderable>>({
	dependencies: {
		scripts: ['./store-layout.script.ts'],
	},
	render: ({ children }) => (
		<body>
			<a class="skip-link" href="#main">
				Skip to content
			</a>
			<header class="store-header">
				<div class="store-header__inner">
					<Logo title="Home">Ecoshop</Logo>
					<SearchForm class="store-header__search" />
					<nav class="store-header__nav" aria-label="Store">
						<a href="/#collections">Collections</a>
						<CartLink />
						<ThemeToggle />
					</nav>
				</div>
			</header>
			{usesDemoCatalog() ? (
				<div class="demo-banner">
					<RuiAlert variant="info" layout="banner">
						<RuiAlertDescription>
							Demo catalog. Set <code>SHOPIFY_STORE_DOMAIN</code> and{' '}
							<code>SHOPIFY_STOREFRONT_ACCESS_TOKEN</code> to sell from your Shopify store.
						</RuiAlertDescription>
					</RuiAlert>
				</div>
			) : null}
			<main id="main" class="store-main">
				{children}
			</main>
			<footer class="store-footer">
				<div class="store-footer__inner">
					<nav aria-label="Store policies" class="store-footer__policies">
						{FOOTER_POLICIES.map(([handle, title]) => (
							<a href={storePaths.policy(handle)}>{title}</a>
						))}
					</nav>
					<p>
						Built with{' '}
						<a class="text-link" href="https://ecopages.app">
							Ecopages
						</a>
						.
					</p>
					<p class="store-footer__agents">
						For agents:{' '}
						<a href={storePaths.llms} data-eco-reload>
							llms.txt
						</a>
						, the MCP server at <code>{storePaths.mcp}</code>, and WebMCP tools on every page.
					</p>
				</div>
			</footer>
			<RuiToaster position="bottom-end" />
			<StoreAgentToolsHost ucp={!usesDemoCatalog()} />
		</body>
	),
});
