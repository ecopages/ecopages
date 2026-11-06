import { eco } from '@ecopages/core';
import type { GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = eco.metadata(() => ({ title: 'Home' }));

export default eco.page({
	layout: 'main',
	render: () => <h1>Home</h1>,
});
