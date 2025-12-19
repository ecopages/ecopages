import type { EcoComponent } from '@ecopages/core';

export type BaseLayoutProps = {
	children: Html.Children;
	class?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children, class: className }) => {
	return (
		<body>
			<main class={className}>{children}</main>
		</body>
	);
};

BaseLayout.config = {
	dependencies: { stylesheets: ['./base-layout.css'], scripts: ['./base-layout.script.ts'] },
};
