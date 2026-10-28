import { eco } from '@ecopages/core';
import type { ErrorPageTemplateProps } from '@ecopages/core';

export default eco.page<ErrorPageTemplateProps>({
	metadata: () => ({ title: 'Not found' }),
	render: () => <h1>Missing 1</h1>,
});
