import { eco, type EcoPagesElement, type LayoutProps } from '@ecopages/core';
import { ThemeToggle } from '@/components/theme-toggle/theme-toggle.kita';
import { Logo } from '@/components/logo/logo.kita';
import { cx } from '@/lib/cx';
import './base-layout.css';

export interface BaseLayoutProps extends LayoutProps<EcoPagesElement> {
	class?: string;
	prose?: boolean;
}

export const BaseLayout = eco.layout<EcoPagesElement>({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},
	render: ({ children, class: className, prose = false }: BaseLayoutProps) => {
		return (
			<body>
				<header class="site-header">
					<Logo href="/" title="Ecopages" />
					<ThemeToggle />
				</header>
				<main class={cx('layout-main', prose && 'prose', className)}>{children}</main>
			</body>
		);
	},
});
