import { createApp } from '@ecopages/core/create-app';
import KitaView from './src/views/kita-view.kita.tsx';
import ReactView from './src/views/react-view.react.tsx';
import LitView from './src/views/lit-view.lit.tsx';
import JsxView from './src/views/jsx-view.eco.tsx';

const app = await createApp();

app.static('/kita-view', KitaView);
app.static('/react-view', ReactView);
app.static('/lit-view', LitView);
app.static('/jsx-view', JsxView);

await app.start();
