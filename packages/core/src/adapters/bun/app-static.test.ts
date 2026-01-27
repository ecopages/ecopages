import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Server } from 'bun';
import { html } from '../../utils/html.ts';
import { eco } from '../../eco/eco.ts';
import { FIXTURE_APP_PROJECT_DIR } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { createBunServerAdapter } from './server-adapter.ts';
import { defineApiHandler } from './define-api-handler.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

let server: Server<unknown>;
const TEST_PORT = 3004;

const AboutPage = eco.page({
	__eco: { integration: 'ghtml', dir: '/test' },
	render: () => html`
		<!doctype html>
		<html>
			<head>
				<title>About</title>
			</head>
			<body>
				<h1>About Page</h1>
				<p>This is a static about page.</p>
			</body>
		</html>
	`,
});

const BlogPostPage = eco.page<{ slug: string }>({
	__eco: { integration: 'ghtml', dir: '/test' },
	render: ({ slug }) => html`
		<!doctype html>
		<html>
			<head>
				<title>Blog: ${slug}</title>
			</head>
			<body>
				<h1>Blog Post</h1>
				<p data-slug="${slug}">Post slug: ${slug}</p>
			</body>
		</html>
	`,
	staticProps: async ({ pathname }) => ({
		props: { slug: String(pathname.params.slug ?? 'unknown') },
	}),
});

const ProductPage = eco.page<{ category: string; id: string }>({
	__eco: { integration: 'ghtml', dir: '/test' },
	render: ({ category, id }) => html`
		<!doctype html>
		<html>
			<head>
				<title>Product: ${id}</title>
			</head>
			<body>
				<h1>Product Page</h1>
				<p data-category="${category}">Category: ${category}</p>
				<p data-id="${id}">ID: ${id}</p>
			</body>
		</html>
	`,
	staticProps: async ({ pathname }) => ({
		props: {
			category: String(pathname.params.category ?? 'unknown'),
			id: String(pathname.params.id ?? 'unknown'),
		},
	}),
});

describe('app.static() Integration Tests', () => {
	beforeAll(async () => {
		const adapter = await createBunServerAdapter({
			appConfig,
			runtimeOrigin: `http://localhost:${TEST_PORT}`,
			options: { watch: false },
			serveOptions: {
				port: TEST_PORT,
				hostname: 'localhost',
			},
			apiHandlers: [
				defineApiHandler({
					path: '/api/health',
					method: 'GET',
					handler: async () => Response.json({ status: 'ok' }),
				}),
			],
			staticRoutes: [
				{ path: '/explicit/about', loader: () => Promise.resolve({ default: AboutPage }) },
				{ path: '/explicit/blog/:slug', loader: () => Promise.resolve({ default: BlogPostPage }) },
				{ path: '/explicit/products/:category/:id', loader: () => Promise.resolve({ default: ProductPage }) },
			],
		});

		server = Bun.serve(adapter.getServerOptions() as Bun.Serve.Options<unknown>);
		await adapter.completeInitialization(server);
	});

	afterAll(() => {
		server.stop(true);
	});

	test('server should be created and running', () => {
		expect(server).toBeDefined();
		expect(server.port).toBe(TEST_PORT);
	});

	describe('static routes', () => {
		test('should serve explicit static route at /explicit/about', async () => {
			const res = await fetch(`http://localhost:${TEST_PORT}/explicit/about`);

			expect(res.status).toBe(200);
			const body = await res.text();
			expect(body).toContain('<h1>About Page</h1>');
			expect(body).toContain('This is a static about page.');
		});

		test('should serve dynamic route with single param', async () => {
			const res = await fetch(`http://localhost:${TEST_PORT}/explicit/blog/hello-world`);

			expect(res.status).toBe(200);
			const body = await res.text();
			expect(body).toContain('<h1>Blog Post</h1>');
			expect(body).toContain('Post slug: hello-world');
			expect(body).toContain('data-slug="hello-world"');
		});

		test('should serve dynamic route with different slug', async () => {
			const res = await fetch(`http://localhost:${TEST_PORT}/explicit/blog/another-post`);

			expect(res.status).toBe(200);
			const body = await res.text();
			expect(body).toContain('Post slug: another-post');
		});

		test('should serve dynamic route with multiple params', async () => {
			const res = await fetch(`http://localhost:${TEST_PORT}/explicit/products/electronics/12345`);

			expect(res.status).toBe(200);
			const body = await res.text();
			expect(body).toContain('<h1>Product Page</h1>');
			expect(body).toContain('Category: electronics');
			expect(body).toContain('ID: 12345');
		});

		test('should fall through to FS router for non-matching explicit route', async () => {
			const res = await fetch(`http://localhost:${TEST_PORT}/explicit/nonexistent`);

			const body = await res.text();
			expect(body).toContain('404');
		});
	});

	describe('API routes work alongside static routes', () => {
		test('should serve API endpoint', async () => {
			const res = await fetch(`http://localhost:${TEST_PORT}/api/health`);

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ status: 'ok' });
		});
	});

	describe('file-system routes still work', () => {
		test('should serve FS route at root', async () => {
			const res = await fetch(`http://localhost:${TEST_PORT}/`);

			expect(res.status).toBe(200);
			const body = await res.text();
			expect(body).toContain('Home Page');
		});
	});
});
