import { eco } from '@ecopages/core';
import { KitaLayout } from '../layouts/kita-layout.kita';

export default eco.page({
	layout: KitaLayout,
	metadata: () => ({ title: 'Kita static' }),
	render: () => <h1>kita-static</h1>,
});
