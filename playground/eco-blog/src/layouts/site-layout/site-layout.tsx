import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import './site-layout.css';

export const SiteLayout = eco.layout<JsxRenderable>({
	render: ({ children }) => (
		<body class="site">
			<a class="skip-link" href="#main">
				Skip to content
			</a>
			<header class="site-header content-grid">
				<div class="site-header__inner breakout">
					<a class="site-brand" href="/">
						EcoBlog
					</a>
					<nav aria-label="Main">
						<ul class="site-nav" role="list">
							<li>
								<a href="/">Posts</a>
							</li>
							<li>
								<a href="/admin">Write</a>
							</li>
						</ul>
					</nav>
				</div>
			</header>
			<main id="main" class="site-main content-grid">
				{children}
			</main>
			<footer class="site-footer content-grid">
				<p class="breakout">Built with Ecopages and Radiant UI.</p>
			</footer>
		</body>
	),
});
