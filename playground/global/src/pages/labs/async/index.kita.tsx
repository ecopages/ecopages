import type { EcoComponent } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

const getData = async () => {
	const res = await fetch('http://localhost:3000/api/hello');
	const data = await res.json();
	return data;
};

const LabsAsyncPage: EcoComponent = async () => {
	const data = await getData();

	return (
		<BaseLayout>
			<div class="banner">
				<h1 class="banner__title">Async Page</h1>
				<p>The data below is collected asynchronously</p>
				<p>
					<b safe>{data.message}</b>
					<br />
					<i safe>{JSON.stringify(data.requestIp)}</i>
				</p>
			</div>
		</BaseLayout>
	);
};

LabsAsyncPage.config = {
	importMeta: import.meta,
	dependencies: {
		components: [BaseLayout],
	},
};

export default LabsAsyncPage;
