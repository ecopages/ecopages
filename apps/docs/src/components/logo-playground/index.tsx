import { eco } from '@ecopages/core';
import './logo-playground.script';

export const LogoPlayground = eco.component({
	dependencies: {
		scripts: ['./logo-playground.script.tsx'],
		stylesheets: [
			'./logo-playground.css',
			'../radiant-controls/radiant-controls.css',
			'../switch/switch.css',
			'../../styles/components/button.css',
		],
	},
	render: ({ class: className }: { class?: string }) => {
		return <radiant-logo-playground class={className}></radiant-logo-playground>;
	},
});
