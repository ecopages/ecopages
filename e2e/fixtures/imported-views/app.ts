import { createApp } from '@ecopages/core/create-app';
import { plainLabel } from './src/components/index.ts';
import LatestView from './src/views/latest-view.kita.tsx';
import PartialView from './src/views/partial-view.kita.tsx';
import StaticView from './src/views/static-view.kita.tsx';
import NotFoundView from './src/views/not-found-view.kita.tsx';

const app = await createApp();

app.get('/latest', (ctx) => ctx.render(LatestView))
	.get('/plain', (ctx) => ctx.json({ label: plainLabel('1') }))
	.get('/partial', (ctx) => ctx.renderPartial(PartialView, {}))
	.static('/static-view', StaticView)
	.notFound(NotFoundView);

await app.start();
