import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import './admin-shell.css';

export type AdminSection = 'posts' | 'new';

type AdminShellProps = {
	current?: AdminSection;
	userName: string;
	children?: JsxRenderable;
};

const links: { section: AdminSection; href: string; label: string }[] = [
	{ section: 'posts', href: '/admin', label: 'All posts' },
	{ section: 'new', href: '/admin/new', label: 'New post' },
];

/** The author area's page frame; each admin Page renders it with the section it shows. */
export const AdminShell = eco.component<AdminShellProps, JsxRenderable>({
	render: ({ current, userName, children }) => (
		<body class="admin">
			<a class="skip-link" href="#main">
				Skip to content
			</a>
			<header class="admin-header">
				<a class="admin-brand" href="/admin">
					EcoBlog <span>Author</span>
				</a>
				<div class="admin-header__meta">
					<span class="admin-user">{userName}</span>
					<a href="/">View site</a>
				</div>
			</header>
			<div class="admin-body">
				<nav class="admin-nav" aria-label="Author area">
					<ul role="list">
						{links.map((link) => (
							<li>
								<a href={link.href} aria-current={link.section === current ? 'page' : undefined}>
									{link.label}
								</a>
							</li>
						))}
					</ul>
				</nav>
				<main id="main" class="admin-main">
					{children}
				</main>
			</div>
		</body>
	),
});
