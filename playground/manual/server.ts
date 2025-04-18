import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import appConfig from './eco.config';

const app = new EcopagesApp({ appConfig });

app.get('/api/hello', async ({ appConfig }) => {
  return new Response(
    JSON.stringify({
      message: 'Hello world!',
      baseUrl: appConfig.baseUrl,
    }),
  );
});

app.get('/api/test/:id/subpath/:subpath', async ({ request }) => {
  const { id, subpath } = request.params;
  return new Response(JSON.stringify({ message: 'Hello from the API!', id, subpath }));
});

app.get('/api/*', async () => {
  return new Response(JSON.stringify({ message: 'Hello from the API! > /api/*' }));
});

await app.start();
