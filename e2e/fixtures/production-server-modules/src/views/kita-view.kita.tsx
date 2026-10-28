import { eco } from '@ecopages/core';
import { KitaLayout } from '../layouts/kita-layout.kita';

export default eco.page({
	layout: KitaLayout,
	metadata: () => ({ title: 'Kita view' }),
	render: () => <h1>kita-view</h1>,
});
