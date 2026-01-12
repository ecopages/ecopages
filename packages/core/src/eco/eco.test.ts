/**
 * Unit tests for the eco namespace API
 */

import { describe, expect, test } from 'vitest';
import { eco } from './eco.ts';
import type { EcoComponent, GetMetadataContext, StaticPath } from '../public-types.ts';
import type { EcoPagesAppConfig } from 'src/internal-types.ts';

const mockAppConfig = {} as EcoPagesAppConfig;

describe('eco namespace', () => {
	describe('eco.component()', () => {
		test('should create a component with basic dependencies', () => {
			type Props = { count: number };
			const Counter = eco.component<Props>({
				dependencies: {
					stylesheets: ['./counter.css'],
					scripts: ['./counter.script.ts'],
				},
				render: ({ count }) => `<my-counter count="${count}"></my-counter>`,
			});

			expect(Counter).toBeDefined();
			expect(typeof Counter).toBe('function');
			expect(Counter.config).toBeDefined();
			expect(Counter.config?.dependencies?.stylesheets).toEqual(['./counter.css']);
			expect(Counter.config?.dependencies?.scripts).toEqual(['./counter.script.ts']);
		});

		test('should render component without lazy dependencies', () => {
			const Component = eco.component({
				render: () => '<div>Hello</div>',
			});

			const result = Component({});
			expect(result).toBe('<div>Hello</div>');
		});

		test('should create component with lazy dependencies', () => {
			const Counter = eco.component({
				dependencies: {
					stylesheets: ['./counter.css'],
					lazy: {
						'on:interaction': 'mouseenter,focusin',
						scripts: ['./counter.script.ts'],
					},
				},
				render: () => '<my-counter></my-counter>',
			});

			expect(Counter.config?.dependencies?.lazy).toBeDefined();
			if (Counter.config?.dependencies?.lazy && 'on:interaction' in Counter.config.dependencies.lazy) {
				expect(Counter.config.dependencies.lazy['on:interaction']).toBe('mouseenter,focusin');
			}
		});

		test('should auto-wrap component with scripts-injector when lazy scripts are resolved', () => {
			const Counter = eco.component({
				dependencies: {
					lazy: {
						'on:interaction': 'mouseenter,focusin',
						scripts: ['./counter.script.ts'],
					},
				},
				render: () => '<my-counter></my-counter>',
			});

			// Simulate renderer setting _resolvedScripts
			if (Counter.config) {
				Counter.config._resolvedScripts = '/_assets/counter.js';
			}

			const result = Counter({});
			expect(result).toContain('<scripts-injector');
			expect(result).toContain('on:interaction="mouseenter,focusin"');
			expect(result).toContain('scripts="/_assets/counter.js"');
			expect(result).toContain('<my-counter></my-counter>');
			expect(result).toContain('</scripts-injector>');
		});

		test('should handle on:idle trigger', () => {
			const Component = eco.component({
				dependencies: {
					lazy: {
						'on:idle': true,
						scripts: ['./script.ts'],
					},
				},
				render: () => '<div>Content</div>',
			});

			if (Component.config) {
				Component.config._resolvedScripts = '/_assets/script.js';
			}

			const result = Component({});
			expect(result).toContain('on:idle');
			expect(result).not.toContain('on:idle="true"');
		});

		test('should handle on:visible trigger with boolean', () => {
			const Component = eco.component({
				dependencies: {
					lazy: {
						'on:visible': true,
						scripts: ['./script.ts'],
					},
				},
				render: () => '<div>Content</div>',
			});

			if (Component.config) {
				Component.config._resolvedScripts = '/_assets/script.js';
			}

			const result = Component({});
			expect(result).toContain('on:visible');
			expect(result).not.toContain('on:visible="true"');
		});

		test('should handle on:visible trigger with threshold value', () => {
			const Component = eco.component({
				dependencies: {
					lazy: {
						'on:visible': '0.5',
						scripts: ['./script.ts'],
					},
				},
				render: () => '<div>Content</div>',
			});

			if (Component.config) {
				Component.config._resolvedScripts = '/_assets/script.js';
			}

			const result = Component({});
			expect(result).toContain('on:visible="0.5"');
		});

		test('should not wrap when lazy is defined but _resolvedScripts is not set', () => {
			const Component = eco.component({
				dependencies: {
					lazy: {
						'on:interaction': 'mouseenter',
						scripts: ['./script.ts'],
					},
				},
				render: () => '<div>Content</div>',
			});

			const result = Component({});
			expect(result).toBe('<div>Content</div>');
			expect(result).not.toContain('scripts-injector');
		});

		test('should pass props to render function', () => {
			type Props = { name: string; count: number };
			const Component = eco.component<Props>({
				render: ({ name, count }) => `<div>${name}: ${count}</div>`,
			});

			const result = Component({ name: 'Counter', count: 5 });
			expect(result).toBe('<div>Counter: 5</div>');
		});
	});

	describe('eco.page()', () => {
		test('should create a page without staticProps', () => {
			const Page = eco.page({
				dependencies: {
					components: [],
				},
				render: () => '<h1>Welcome</h1>',
			});

			expect(Page).toBeDefined();
			expect(typeof Page).toBe('function');
			expect(Page.config).toBeDefined();
		});

		test('should create a page with typed props', () => {
			type PageProps = { params?: { slug?: string }; query?: Record<string, string> };
			const Page = eco.page<PageProps>({
				render: ({ params }) => `<h1>${params?.slug || 'Home'}</h1>`,
			});

			const result = Page({ params: { slug: 'test-post' } });
			expect(result).toBe('<h1>test-post</h1>');
		});

		test('should work with lazy dependencies on pages', () => {
			const Page = eco.page({
				dependencies: {
					lazy: {
						'on:interaction': 'click',
						scripts: ['./page.script.ts'],
					},
				},
				render: () => '<div>Page Content</div>',
			});

			if (Page.config) {
				Page.config._resolvedScripts = '/_assets/page.js';
			}

			const result = Page({});
			expect(result).toContain('<scripts-injector');
			expect(result).toContain('on:interaction="click"');
		});
	});

	describe('eco.metadata()', () => {
		test('should be an identity function', () => {
			const metadataFn = () => ({
				title: 'Home',
				description: 'Welcome',
			});

			const wrapped = eco.metadata(metadataFn);
			expect(wrapped).toBe(metadataFn);
		});

		test('should work with async metadata function', async () => {
			const metadataFn = async () => ({
				title: 'Home',
				description: 'Welcome',
			});

			const wrapped = eco.metadata(metadataFn);
			const result = await wrapped({ props: {}, params: {}, query: {}, appConfig: mockAppConfig });
			expect(result.title).toBe('Home');
		});

		test('should work with props-based metadata', () => {
			const metadataFn = async () => ({ title: 'My Post', description: 'Post excerpt' });
			const wrapped = eco.metadata(metadataFn);
			expect(wrapped).toBe(metadataFn);
		});
	});

	describe('eco.staticPaths()', () => {
		test('should be an identity function', () => {
			const staticPathsFn = async () => ({
				paths: [{ params: { slug: 'post-1' } }, { params: { slug: 'post-2' } }],
			});

			const wrapped = eco.staticPaths(staticPathsFn);
			expect(wrapped).toBe(staticPathsFn);
		});

		test('should preserve function behavior', async () => {
			const staticPathsFn = async () => ({
				paths: [{ params: { slug: 'post-1' } }, { params: { slug: 'post-2' } }],
			});

			const wrapped = eco.staticPaths(staticPathsFn);
			const result = await wrapped({ appConfig: mockAppConfig, runtimeOrigin: '' });
			expect(result.paths).toHaveLength(2);
			expect(result.paths[0].params.slug).toBe('post-1');
		});
	});

	describe('eco.staticProps()', () => {
		test('should be an identity function', () => {
			const staticPropsFn = async ({ pathname }: any) => ({
				props: { slug: pathname.params.slug },
			});

			const wrapped = eco.staticProps(staticPropsFn);
			expect(wrapped).toBe(staticPropsFn);
		});

		test('should preserve function behavior', async () => {
			const staticPropsFn = async ({ pathname }: any) => ({
				props: { post: { title: 'Test Post', slug: pathname.params.slug } },
			});

			const wrapped = eco.staticProps(staticPropsFn);
			const result = await wrapped({
				pathname: { params: { slug: 'my-post' } },
				appConfig: mockAppConfig,
				runtimeOrigin: '',
			});
			expect(result.props.post.title).toBe('Test Post');
			expect(result.props.post.slug).toBe('my-post');
		});
	});

	describe('integration', () => {
		test('should work with nested components', () => {
			const Button = eco.component<{ label: string }>({
				dependencies: {
					lazy: {
						'on:interaction': 'click',
						scripts: ['./button.script.ts'],
					},
				},
				render: ({ label }) => `<button>${label}</button>`,
			});

			const Card = eco.component<{ title: string; children: string }>({
				dependencies: {
					components: [Button as EcoComponent],
				},
				render: ({ title, children }) => `<div class="card"><h2>${title}</h2>${children}</div>`,
			});

			expect(Card.config?.dependencies?.components).toContain(Button);
		});
	});

	test('should attach staticPaths when provided (consolidated API)', () => {
		const staticPathsFn = async () => ({
			paths: [{ params: { slug: 'post-1' } }, { params: { slug: 'post-2' } }],
		});

		const Page = eco.page({
			staticPaths: staticPathsFn,
			render: () => '<h1>Page</h1>',
		});

		expect(Page.staticPaths).toBe(staticPathsFn);
	});

	test('should attach staticProps when provided (consolidated API)', () => {
		type Props = { title: string; slug: string };

		const staticPropsFn = async ({ pathname }: { pathname: StaticPath }) => ({
			props: { title: 'Test', slug: pathname.params.slug as string },
		});

		const Page = eco.page<Props>({
			staticProps: staticPropsFn,
			render: ({ title }) => `<h1>${title}</h1>`,
		});

		expect(Page.staticProps).toBe(staticPropsFn);
	});

	test('should attach metadata when provided (consolidated API)', () => {
		type Props = { title: string };

		const metadataFn = ({ props: { title } }: GetMetadataContext<Props>) => ({
			title,
			description: `Page: ${title}`,
		});

		const Page = eco.page<Props>({
			metadata: metadataFn,
			render: ({ title }) => `<h1>${title}</h1>`,
		});

		expect(Page.metadata).toBe(metadataFn);
	});

	test('should attach all static functions together (consolidated API)', async () => {
		type Props = { title: string; slug: string };

		const Page = eco.page<Props>({
			staticPaths: async () => ({
				paths: [{ params: { slug: 'hello' } }],
			}),
			staticProps: async ({ pathname }) => ({
				props: { title: 'Hello World', slug: pathname.params.slug as string },
			}),
			metadata: ({ props: { title } }) => ({
				title,
				description: `Page: ${title}`,
			}),
			render: ({ title }) => `<h1>${title}</h1>`,
		});

		expect(Page.staticPaths).toBeDefined();
		expect(Page.staticProps).toBeDefined();
		expect(Page.metadata).toBeDefined();

		// Verify they work correctly
		const paths = await Page.staticPaths!({ appConfig: mockAppConfig, runtimeOrigin: '' });
		expect(paths.paths).toHaveLength(1);

		const props = await Page.staticProps!({
			pathname: { params: { slug: 'hello' } },
			appConfig: mockAppConfig,
			runtimeOrigin: '',
		});
		expect(props.props.title).toBe('Hello World');

		const result = Page({ title: 'Hello World', slug: 'hello' });
		expect(result).toBe('<h1>Hello World</h1>');
	});

	test('should not have static functions when not provided', () => {
		const Page = eco.page({
			render: () => '<h1>Simple Page</h1>',
		});

		expect(Page.staticPaths).toBeUndefined();
		expect(Page.staticProps).toBeUndefined();
		expect(Page.metadata).toBeUndefined();
	});
});
