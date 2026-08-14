import { eco } from '@ecopages/core';

export type BaseLayoutProps = {
	children: string;
	class?: string;
};

export const BaseLayout = eco.component<BaseLayoutProps>({
	dependencies: {
		stylesheets: ['./base-layout.css'],
	},
	render: ({ children, class: className }) => `
		<body>
			<main class="${className}">${children}</main>
		</body>
	`,
});
