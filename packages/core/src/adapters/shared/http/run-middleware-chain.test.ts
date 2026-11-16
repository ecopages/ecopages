import { describe, expect, it } from 'vitest';
import { runMiddlewareChain, type MiddlewareHandler } from './run-middleware-chain.ts';

type TestContext = { readonly trail: string[]; readonly locals: Record<string, unknown> };

function context(): TestContext {
	return { trail: [], locals: {} };
}

function terminalFor(ctx: TestContext) {
	return async () => {
		ctx.trail.push('terminal');
		return new Response('terminal');
	};
}

describe('runMiddlewareChain', () => {
	it('runs the stages in order and then the terminal handler', async () => {
		const ctx = context();
		const stage =
			(name: string): MiddlewareHandler<TestContext> =>
			async (c, next) => {
				c.trail.push(name);
				return next();
			};

		const response = await runMiddlewareChain([stage('a'), stage('b')], ctx, terminalFor(ctx));

		expect(await response.text()).toBe('terminal');
		expect(ctx.trail).toEqual(['a', 'b', 'terminal']);
	});

	it('runs the terminal handler when there is no middleware', async () => {
		const ctx = context();

		await runMiddlewareChain([], ctx, terminalFor(ctx));

		expect(ctx.trail).toEqual(['terminal']);
	});

	it('stops at a stage that answers without calling next', async () => {
		const ctx = context();
		const guard: MiddlewareHandler<TestContext> = async () => new Response('forbidden', { status: 403 });
		const never: MiddlewareHandler<TestContext> = async (c, next) => {
			c.trail.push('never');
			return next();
		};

		const response = await runMiddlewareChain([guard, never], ctx, terminalFor(ctx));

		expect(response.status).toBe(403);
		expect(ctx.trail).toEqual([]);
	});

	it('lets a stage edit the response after next', async () => {
		const ctx = context();
		const stamp: MiddlewareHandler<TestContext> = async (_c, next) => {
			const response = await next();
			response.headers.set('x-handled', '1');
			return response;
		};

		const response = await runMiddlewareChain([stamp], ctx, terminalFor(ctx));

		expect(response.headers.get('x-handled')).toBe('1');
	});

	it('does not let a second next call bypass a guard that already answered', async () => {
		const ctx = context();
		const outer: MiddlewareHandler<TestContext> = async (_c, next) => {
			await next();
			return next();
		};
		const guard: MiddlewareHandler<TestContext> = async (c) => {
			c.trail.push('guard');
			return new Response('forbidden', { status: 403 });
		};

		await expect(runMiddlewareChain([outer, guard], ctx, terminalFor(ctx))).rejects.toThrow(
			/called next\(\) more than once/,
		);

		expect(ctx.trail).toEqual(['guard']);
	});

	it('does not run the terminal handler a second time when next is called twice', async () => {
		const ctx = context();
		const twice: MiddlewareHandler<TestContext> = async (_c, next) => {
			await next();
			return next();
		};

		await expect(runMiddlewareChain([twice], ctx, terminalFor(ctx))).rejects.toThrow(/more than once/);

		expect(ctx.trail).toEqual(['terminal']);
	});

	it('rejects a concurrent second call to next', async () => {
		const ctx = context();
		const concurrent: MiddlewareHandler<TestContext> = async (_c, next) => {
			const [first] = await Promise.all([next(), next()]);
			return first;
		};

		await expect(runMiddlewareChain([concurrent], ctx, terminalFor(ctx))).rejects.toThrow(/more than once/);

		expect(ctx.trail.filter((entry) => entry === 'terminal')).toEqual(['terminal']);
	});

	it('rejects a stage that calls next without awaiting it and returns another response', async () => {
		const ctx = context();
		const replace: MiddlewareHandler<TestContext> = async (_c, next) => {
			void next();
			return new Response('replacement');
		};
		const guard: MiddlewareHandler<TestContext> = async (c) => {
			c.trail.push('guard');
			return new Response('forbidden', { status: 403 });
		};

		await expect(runMiddlewareChain([replace, guard], ctx, terminalFor(ctx))).rejects.toThrow(
			/returned a different response/,
		);

		expect(ctx.trail).toEqual(['guard']);
	});

	it('waits for the rest of the chain when a stage returns the unawaited next result', async () => {
		const ctx = context();
		const forward: MiddlewareHandler<TestContext> = (_c, next) => next();
		const slow: MiddlewareHandler<TestContext> = async (c, next) => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			c.trail.push('slow');
			return next();
		};

		const response = await runMiddlewareChain([forward, slow], ctx, terminalFor(ctx));

		expect(await response.text()).toBe('terminal');
		expect(ctx.trail).toEqual(['slow', 'terminal']);
	});

	it('does not let a stage that answered call next later', async () => {
		const ctx = context();
		let late: (() => Promise<Response>) | undefined;
		const deny: MiddlewareHandler<TestContext> = async (_c, next) => {
			late = () => next();
			return new Response('forbidden', { status: 403 });
		};

		const response = await runMiddlewareChain([deny], ctx, terminalFor(ctx));

		expect(response.status).toBe(403);
		expect(() => late?.()).toThrow(/called next\(\) after it returned/);
		expect(ctx.trail).toEqual([]);
	});

	it('does not let a stage that threw call next later', async () => {
		const ctx = context();
		let late: (() => Promise<Response>) | undefined;
		const failing: MiddlewareHandler<TestContext> = async (_c, next) => {
			late = () => next();
			throw new Error('stage failed');
		};

		await expect(runMiddlewareChain([failing], ctx, terminalFor(ctx))).rejects.toThrow('stage failed');

		expect(() => late?.()).toThrow(/after it returned/);
		expect(ctx.trail).toEqual([]);
	});

	it('waits for an unawaited next before rethrowing what the stage threw', async () => {
		const ctx = context();
		const failing: MiddlewareHandler<TestContext> = async (_c, next) => {
			void next();
			throw new Error('stage failed');
		};
		const slow: MiddlewareHandler<TestContext> = async (c, next) => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			c.trail.push('slow');
			return next();
		};

		await expect(runMiddlewareChain([failing, slow], ctx, terminalFor(ctx))).rejects.toThrow('stage failed');

		expect(ctx.trail).toEqual(['slow', 'terminal']);
	});

	it('lets a stage answer with its own response when the rest of the chain throws', async () => {
		const ctx = context();
		const recover: MiddlewareHandler<TestContext> = async (_c, next) => {
			try {
				return await next();
			} catch {
				return new Response('recovered', { status: 500 });
			}
		};
		const failing: MiddlewareHandler<TestContext> = async () => {
			throw new Error('handler failed');
		};

		const response = await runMiddlewareChain([recover, failing], ctx, terminalFor(ctx));

		expect(response.status).toBe(500);
		expect(await response.text()).toBe('recovered');
	});

	it('lets each stage call its own next once, so a long chain still completes', async () => {
		const ctx = context();
		const stage: MiddlewareHandler<TestContext> = async (c, next) => {
			c.trail.push('stage');
			return next();
		};

		await runMiddlewareChain([stage, stage, stage], ctx, terminalFor(ctx));

		expect(ctx.trail).toEqual(['stage', 'stage', 'stage', 'terminal']);
	});
});
