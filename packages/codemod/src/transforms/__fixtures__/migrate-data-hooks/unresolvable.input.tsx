import { eco } from '@ecopages/core';
import { staticProps } from './hooks';

export default eco.page({
	staticProps,
	render: () => <h1>Hello</h1>,
});
