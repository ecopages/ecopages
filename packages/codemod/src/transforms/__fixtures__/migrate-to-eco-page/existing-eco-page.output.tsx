import { eco } from '@ecopages/core';

export default eco.page({
	layout: 'main',
	metadata: () => ({ title: 'Home' }),
	render: () => <h1>Home</h1>,
});
