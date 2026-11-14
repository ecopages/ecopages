import { eco } from '@ecopages/core';

export default eco.page({
	staticProps: () => buildEnvelope(),
	render: () => <h1>Hello</h1>,
});
