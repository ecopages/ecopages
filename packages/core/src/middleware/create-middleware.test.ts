import { describe, expect, it } from 'vitest';
import { runMiddlewareChain } from '../adapters/shared/http/run-middleware-chain.ts';
import { composeMiddleware, createMiddleware, flattenMiddleware } from './create-middleware.ts';

type TestContext = { readonly locals: Record<string, unknown>; readonly request: Request };

function context(): TestContext {
	return { locals: {}, request: new Request('http://localhost/') };
}

async function run(entries: Parameters<typeof flattenMiddleware>[0], ctx: TestContext) {
	return runMiddlewareChain(flattenMiddleware<TestContext>(entries), ctx, async () => new Response('done'));
}

describe('createMiddleware and composeMiddleware', () => {
	it('merges what each stage passes to next into locals, in order', async () => {
		const first = createMiddleware((_ctx, next) => next({ a: 1 }));
		const second = composeMiddleware(first, (ctx, next) => next({ b: ctx.locals.a + 1 }));
		const ctx = context();

		const response = await run([second], ctx);

		expect(await response.text()).toBe('done');
		expect(ctx.locals).toEqual({ a: 1, b: 2 });
	});

	it('lets a later stage override an earlier key', async () => {
		const theme = createMiddleware((_ctx, next) => next({ theme: 'dark' }));
		const retheme = createMiddleware((_ctx, next) => next({ theme: 'blue' }));
		const ctx = context();

		await run([theme, retheme], ctx);

		expect(ctx.locals).toEqual({ theme: 'blue' });
	});

	it('stops the request when a stage returns a Response, so later stages and the terminal do not run', async () => {
		const seen: string[] = [];
		const gate = createMiddleware(() => new Response('closed', { status: 503 }));
		const after = createMiddleware((_ctx, next) => {
			seen.push('after');
			return next();
		});

		const response = await run([gate, after], context());

		expect(response.status).toBe(503);
		expect(seen).toEqual([]);
	});

	it('rejects a stage reached twice, naming both positions', () => {
		const requireSession = createMiddleware((_ctx, next) => next({ session: 'u1' }));
		const adminOnly = composeMiddleware(requireSession, (ctx, next) =>
			next({ role: `admin-${ctx.locals.session}` }),
		);

		expect(() => flattenMiddleware([requireSession, adminOnly], 'route GET /me')).toThrow(
			/route GET \/me runs the same middleware stage twice, at positions 0 and 1/,
		);
	});

	it('rejects a duplicate inside a composition', () => {
		const requireSession = createMiddleware((_ctx, next) => next({ session: 'u1' }));

		expect(() => composeMiddleware(requireSession, requireSession)).toThrow(
			/composition runs the same middleware stage twice/,
		);
	});

	it('rejects a stage that called next and returned another response', async () => {
		const replace = createMiddleware(async (_ctx, next) => {
			await next();
			return new Response('replacement');
		});

		await expect(run([replace], context())).rejects.toThrow(/returned a different response/);
	});

	it('rejects a second call to next from one stage', async () => {
		const twice = createMiddleware(async (_ctx, next) => {
			await next();
			return next();
		});

		await expect(run([twice], context())).rejects.toThrow(/more than once/);
	});

	it('still lets a stage edit the response after next', async () => {
		const stamp = createMiddleware(async (_ctx, next) => {
			const response = await next();
			response.headers.set('x-handled', '1');
			return response;
		});

		const response = await run([stamp], context());

		expect(response.headers.get('x-handled')).toBe('1');
	});

	it('runs a plain function in the list as one stage that provides nothing', async () => {
		const plain = (_ctx: unknown, next: () => Promise<Response>) => next();
		const ctx = context();

		const response = await run([plain, createMiddleware((_c, next) => next({ k: 1 }))], ctx);

		expect(await response.text()).toBe('done');
		expect(ctx.locals).toEqual({ k: 1 });
	});

	it('flattens an undefined list to no stages', () => {
		expect(flattenMiddleware(undefined)).toEqual([]);
	});
});
