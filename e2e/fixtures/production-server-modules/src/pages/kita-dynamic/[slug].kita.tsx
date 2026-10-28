import { eco } from '@ecopages/core';
import { KitaLayout } from '../../layouts/kita-layout.kita';

export default eco.page({
	layout: KitaLayout,
	cache: 'dynamic',
	metadata: () => ({ title: 'Kita dynamic' }),
	render: ({ params }) => <h1>kita-dynamic {String(params.slug)}</h1>,
});
