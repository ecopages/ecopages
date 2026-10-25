import { createApp } from '@ecopages/core/create-app';

const app = await createApp();

app.static('/kita-view', './src/views/kita-view.kita');
app.static('/react-view', './src/views/react-view.react');
app.static('/lit-view', './src/views/lit-view.lit');
app.static('/jsx-view', './src/views/jsx-view.eco');

await app.start();
