import { eco, type EcoPagesElement, type LayoutProps } from '@ecopages/core';
import { Navigation } from '@/components/navigation';
import { RadiantCounter } from '@/components/radiant-counter';
import './base-layout.css';

export interface BaseLayoutProps extends LayoutProps<EcoPagesElement> {
	class?: string;
}

export const BaseLayout = eco.layout<EcoPagesElement, BaseLayoutProps>({
	dependencies: {
		scripts: ['./base-layout.script.ts'],
	},

	render: ({ children, class: className }) => {
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
						{ label: 'Video', url: '/video' },
						{ label: 'Video Detail', url: '/video-detail' },
					]}
				/>
				<RadiantCounter data-eco-persist="counter" count={5} />
				<main class={className}>{children as 'safe'}</main>
			</body>
		);
	},
});
