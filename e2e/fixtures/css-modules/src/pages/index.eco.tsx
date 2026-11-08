/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { EcoEmbed } from '@ecopages/ecopages-jsx/eco-embed';
import { Badge } from '@/components/badge.eco';
import { ReactButton } from '@/components/button.react';

export default eco.page<{}, JsxRenderable>({
	dependencies: {
		components: [Badge, ReactButton],
	},
	metadata: () => ({
		title: 'CSS Modules',
		description: 'CSS Modules in an Eco JSX component, and a React island.',
	}),
	render: () => (
		<main>
			<Badge />
			<EcoEmbed component={ReactButton} props={{}} />
		</main>
	),
});
