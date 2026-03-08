import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Counter } from '@/components/counter';
import { BaseLayout } from '@/layouts/base-layout';

const EcopagesLogo = () => {
	return (
		<div className="flex gap-2 md:gap-6">
			<div className="ecopages-logo">
				<div className="folded-rectangle" />
				<div className="folded-rectangle" />
				<div className="folded-rectangle" />
			</div>
			<span className="text-2xl font-bold">ecopages</span>
		</div>
	);
};

export default eco.page<{}, ReactNode>({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [Counter, BaseLayout],
	},

	metadata: () => ({
		title: 'Home page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout class="main-content">
				<EcopagesLogo />
				<Counter defaultValue={10} />
			</BaseLayout>
		);
	},
});
