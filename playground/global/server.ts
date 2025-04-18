import { EcopagesApp } from '@ecopages/core/adapters/bun/create-app';
import appConfig from './eco.config';
import { getAllAuthorIds, getAllBlogPostSlugs, getAuthor, getBlogPost } from './src/mocks/data';

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

app.get('/api/blog/posts', async () => {
  const posts = getAllBlogPostSlugs();
  return new Response(JSON.stringify(posts), {
    headers: { 'Content-Type': 'application/json' },
  });
});

app.get('/api/blog/post/:slug', async ({ request }) => {
  const { slug } = request.params;
  const post = getBlogPost(slug);

  if (post) {
    return new Response(JSON.stringify(post), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Post not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
});

app.get('/api/blog/authors', async () => {
  const authors = getAllAuthorIds();
  return new Response(JSON.stringify(authors), {
    headers: { 'Content-Type': 'application/json' },
  });
});

app.get('/api/blog/author/:id', async ({ request }) => {
  const { id } = request.params;
  const author = getAuthor(id);

  if (author) {
    return new Response(JSON.stringify(author), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Author not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
});

app.get('/api/*', async () => {
  return new Response(JSON.stringify({ message: 'Hello from the API! > /api/*' }));
});

await app.start();
