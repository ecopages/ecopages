import { createApp } from '@ecopages/core/create-app';
import KitaView from './src/views/kita-view.kita.tsx';
import ReactView from './src/views/react-view.react.tsx';

const app = await createApp();

app.get('/react-view', (ctx) => ctx.render(ReactView)).get('/kita-view', (ctx) => ctx.render(KitaView));

await app.start();
