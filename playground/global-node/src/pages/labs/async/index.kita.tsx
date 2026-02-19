import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

type PageProps = {
	message: string;
	now: string;
};

export default eco.page<PageProps>({
	dependencies: {
		components: [BaseLayout],
	},
	staticProps: async ({ runtimeOrigin }) => {
		const res = await fetch(`${runtimeOrigin}/api/hello`);
		const data = await res.json();
		return {
			props: {
				...data,
				now: new Date().getMilliseconds().toString(),
			},
		};
	},
	render: ({ message, now }) => {
		return (
			<BaseLayout>
				<div class="banner">
					<h1 class="banner__title">Async Page</h1>
					<p>The data below is collected asynchronously</p>
					<p>
						<span safe>{message}</span>
						<br />
						<span safe>server: {now}ms</span>
						<br />
						<span safe>{`now: ${new Date().getMilliseconds().toString()}ms`}</span>
					</p>
				</div>
			</BaseLayout>
		);
	},
});
