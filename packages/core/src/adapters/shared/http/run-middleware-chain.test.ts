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

	it('answers with the response a stage returns after the rest of the chain it started settles', async () => {
		const ctx = context();
		const replace: MiddlewareHandler<TestContext> = async (_c, next) => {
			void next();
			return new Response('replacement');
		};
		const guard: MiddlewareHandler<TestContext> = async (c) => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			c.trail.push('guard');
			return new Response('forbidden', { status: 403 });
		};

		const response = await runMiddlewareChain([replace, guard], ctx, terminalFor(ctx));

		expect(await response.text()).toBe('replacement');
		expect(ctx.trail).toEqual(['guard']);
	});

	it('lets an outer stage wrap an immutable redirect to add headers', async () => {
		const ctx = context();
		const tagResponse: MiddlewareHandler<TestContext> = async (_c, next) => {
			const response = await next();
			const tagged = new Response(response.body, response);
			tagged.headers.set('x-request-id', 'r1');
			return tagged;
		};
		const guard: MiddlewareHandler<TestContext> = async () => Response.redirect('https://example.com/login', 302);

		const response = await runMiddlewareChain([tagResponse, guard], ctx, terminalFor(ctx));

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('https://example.com/login');
		expect(response.headers.get('x-request-id')).toBe('r1');
	});

	it('rejects a nested call to next from the stage it started', async () => {
		const ctx = context();
		let again: (() => Promise<Response>) | undefined;
		const outer: MiddlewareHandler<TestContext> = (_c, next) => {
			again = () => next();
			return next();
		};
		const inner: MiddlewareHandler<TestContext> = (_c, next) => {
			again?.();
			return next();
		};

		await expect(runMiddlewareChain([outer, inner], ctx, terminalFor(ctx))).rejects.toThrow(/more than once/);

		expect(ctx.trail).toEqual([]);
	});

	it('keeps a provided __proto__ key as a plain local', async () => {
		const ctx = context();
		const provide: MiddlewareHandler<TestContext> = (_c, next) =>
			next(JSON.parse('{"__proto__":{"isAdmin":true},"user":"u1"}') as Record<string, unknown>);

		await runMiddlewareChain([provide], ctx, terminalFor(ctx));

		expect(Object.getPrototypeOf(ctx.locals)).toBe(Object.prototype);
		expect(ctx.locals.isAdmin).toBeUndefined();
		expect(ctx.locals.user).toBe('u1');
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

	it.each([
		['overwrites', (locals: Record<string, unknown>) => (locals.session = 42)],
		['deletes', (locals: Record<string, unknown>) => delete locals.session],
	])('rejects a stage that %s a local an earlier stage provided before it continues', async (_change, change) => {
		const ctx = context();
		const provide: MiddlewareHandler<TestContext> = (_c, next) => next({ session: { userId: 'u1' } });
		const clobber: MiddlewareHandler<TestContext> = (c, next) => {
			change(c.locals);
			return next();
		};

		await expect(runMiddlewareChain([provide, clobber], ctx, terminalFor(ctx))).rejects.toThrow(
			/stage 1 changed the local "session" that an earlier stage provided/,
		);
		expect(ctx.trail).toEqual([]);
	});

	it('lets a stage write a new local and a later stage provide a key again', async () => {
		const ctx = context();
		const provide: MiddlewareHandler<TestContext> = (_c, next) => next({ session: 'a' });
		const plain: MiddlewareHandler<TestContext> = (c, next) => {
			c.locals.locale = 'en';
			return next();
		};
		const reprovide: MiddlewareHandler<TestContext> = (_c, next) => next({ session: 'b' });

		await runMiddlewareChain([provide, plain, reprovide], ctx, terminalFor(ctx));

		expect(ctx.locals).toEqual({ session: 'b', locale: 'en' });
		expect(ctx.trail).toEqual(['terminal']);
	});

	describe('when the rest of the chain fails', () => {
		const failingHandler = async (): Promise<Response> => {
			throw new Error('handler failed');
		};

		it('rethrows the failure of a next call the stage never looked at', async () => {
			const ignore: MiddlewareHandler<TestContext> = (_c, next) => {
				next();
				return new Response('ok');
			};

			await expect(runMiddlewareChain([ignore], context(), failingHandler)).rejects.toThrow('handler failed');
		});

		it('rethrows the failure when the stage discards next with void', async () => {
			const discard: MiddlewareHandler<TestContext> = async (_c, next) => {
				void next();
				return new Response('ok');
			};

			await expect(runMiddlewareChain([discard], context(), failingHandler)).rejects.toThrow('handler failed');
		});

		it('rethrows a failure that comes after the stage answered', async () => {
			const ignore: MiddlewareHandler<TestContext> = (_c, next) => {
				next();
				return new Response('ok');
			};
			const slowFailure = async (): Promise<Response> => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				throw new Error('late failure');
			};

			await expect(runMiddlewareChain([ignore], context(), slowFailure)).rejects.toThrow('late failure');
		});

		it('rethrows the failure past an outer stage that awaits the inner one', async () => {
			const outer: MiddlewareHandler<TestContext> = async (_c, next) => next();
			const ignore: MiddlewareHandler<TestContext> = (_c, next) => {
				next();
				return new Response('ok');
			};

			await expect(runMiddlewareChain([outer, ignore], context(), failingHandler)).rejects.toThrow(
				'handler failed',
			);
		});

		it('keeps the fallback of a stage that awaits next in try and catch', async () => {
			const recover: MiddlewareHandler<TestContext> = async (_c, next) => {
				try {
					await next();
				} catch {
					return new Response('fallback', { status: 500 });
				}
				return new Response('unreachable');
			};

			const response = await runMiddlewareChain([recover], context(), failingHandler);

			expect(await response.text()).toBe('fallback');
		});

		it('keeps the response of a stage that catches next with catch', async () => {
			const recover: MiddlewareHandler<TestContext> = async (_c, next) => {
				next().catch(() => undefined);
				return new Response('own');
			};

			const response = await runMiddlewareChain([recover], context(), failingHandler);

			expect(await response.text()).toBe('own');
		});

		it('keeps the response of a stage that passes next to Promise.allSettled', async () => {
			const settle: MiddlewareHandler<TestContext> = async (_c, next) => {
				await Promise.allSettled([next()]);
				return new Response('own');
			};

			const response = await runMiddlewareChain([settle], context(), failingHandler);

			expect(await response.text()).toBe('own');
		});

		it('propagates the failure through a stage that returns next from an async function', async () => {
			const forward: MiddlewareHandler<TestContext> = async (_c, next) => {
				return next();
			};
			const recover: MiddlewareHandler<TestContext> = async (_c, next) => {
				try {
					return await next();
				} catch (error) {
					return new Response(error instanceof Error ? error.message : 'unknown', { status: 500 });
				}
			};

			await expect(runMiddlewareChain([forward], context(), failingHandler)).rejects.toThrow('handler failed');
			const response = await runMiddlewareChain([recover, forward], context(), failingHandler);
			expect(await response.text()).toBe('handler failed');
		});

		it('rethrows the error of a stage that throws rather than the failure it dropped', async () => {
			const failing: MiddlewareHandler<TestContext> = (_c, next) => {
				next();
				throw new Error('stage failed');
			};

			await expect(runMiddlewareChain([failing], context(), failingHandler)).rejects.toThrow('stage failed');
		});
	});

	it('answers with the response of a stage that never looked at next when the rest succeeds', async () => {
		const ctx = context();
		const ignore: MiddlewareHandler<TestContext> = (_c, next) => {
			next();
			return new Response('own');
		};

		const response = await runMiddlewareChain([ignore], ctx, terminalFor(ctx));

		expect(await response.text()).toBe('own');
		expect(ctx.trail).toEqual(['terminal']);
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
