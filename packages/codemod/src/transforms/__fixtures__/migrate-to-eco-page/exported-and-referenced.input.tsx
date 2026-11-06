import { eco } from '@ecopages/core';
import type { GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({ title: 'Home' });

export default eco.page({
	metadata: getMetadata,
	render: () => <h1>Home</h1>,
});
