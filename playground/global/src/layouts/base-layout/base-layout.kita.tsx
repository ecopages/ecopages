import type { EcoComponent } from '@ecopages/core';
import { Navigation } from '@/components/navigation';
import { RadiantCounter } from '@/components/radiant-counter';

export type BaseLayoutProps = {
	children: JSX.Element | JSX.Element[];
	class?: string;
};

export const BaseLayout: EcoComponent<BaseLayoutProps> = ({ children, class: className }) => {
	return (
		<body>
			<Navigation
				items={[
					{ label: 'Home', url: '/' },
					{ label: 'Tailwind', url: '/labs/tailwind' },
					{ label: 'Async', url: '/labs/async' },
					{ label: 'MDX', url: '/test' },
					{ label: 'Radiant', url: '/labs/radiant' },
					{ label: 'Images', url: '/labs/images' },
					{ label: 'Plain Css', url: '/plain-css' },
				]}
			/>
			<RadiantCounter data-eco-persist="counter" count={5} />
			<main class={className}>{children as 'safe'}</main>
		</body>
	);
};

BaseLayout.config = {
	dependencies: {
		stylesheets: ['./base-layout.css'],
		scripts: ['./base-layout.script.ts'],
		components: [Navigation, RadiantCounter],
	},
};
