import { eco, type LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { CartLink } from '@/components/cart-link/cart-link';
import { SearchBox } from '@/components/search-box/search-box';
import '@/styles/catalog.css';
import './base-layout.css';

export type BaseLayoutProps = LayoutProps<JsxRenderable> & {
	/** Prefills the header search, as on `/search?q=…`. */
	searchQuery?: string;
};

export const BaseLayout = eco.layout<JsxRenderable, BaseLayoutProps>({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children, searchQuery }) => (
		<body>
			<a class="skip-link" href="#content">
				Skip to content
			</a>
			<header class="site-header">
				<div class="site-header__inner">
					<a href="/" class="site-logo" data-eco-prefetch="viewport">
						<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
							<rect width="32" height="32" rx="8" fill="currentColor" />
							<path d="M9 21h14l-2-9H11z" fill="var(--background)" />
						</svg>
						Ecofaster
					</a>
					<SearchBox query={searchQuery} />
					<CartLink />
				</div>
			</header>
			<main id="content" class="site-main">
				{children}
			</main>
			<footer class="site-footer">
				<p>
					Ecofaster is an <a href="https://ecopages.app">Ecopages</a> template. Products, prices and images
					are generated; nothing here is for sale.
				</p>
			</footer>
		</body>
	),
});
