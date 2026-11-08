import { eco, type LayoutProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Logo } from '@/components/logo/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import prose from '@/styles/prose.module.css';
import styles from './base-layout.module.css';

export interface BaseLayoutProps extends LayoutProps<JsxRenderable> {
	class?: string;
	prose?: boolean;
}

export const BaseLayout = eco.layout<JsxRenderable, BaseLayoutProps>({
	dependencies: {
		scripts: [{ src: './base-layout.script.ts', attributes: { 'data-eco-rerun': '' } }],
	},
	render: ({ children, class: className, prose: isProse = false }) => {
		return (
			<body>
				<header class={styles.header}>
					<Logo href="/" title="Ecopages" />
					<ThemeToggle />
				</header>
				<main classes={[styles.main, { [prose.prose]: isProse }, className]}>{children}</main>
			</body>
		);
	},
});
