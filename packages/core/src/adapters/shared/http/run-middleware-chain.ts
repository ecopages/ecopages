export type MiddlewareHandler<TContext> = (
	context: TContext,
	next: (locals?: Record<string, unknown>) => Promise<Response>,
) => Response | Promise<Response>;

/**
 * Runs an onion middleware chain and invokes the terminal handler when the chain completes.
 *
 * @remarks
 * Each stage receives its own `next`, which continues the chain exactly once. A second call throws before the
 * chain advances, even from inside a later stage: a shared cursor would let a stage that calls `next` twice resume
 * the chain after a guard that had already answered, running everything behind the guard, including the terminal
 * handler, a second time. `next` also throws once its stage has returned or thrown, so a stage that answered cannot
 * start the rest of the chain later, from a timer or a callback.
 *
 * A stage continues with `next(locals)`. The chain defines each own key it provides on `context.locals` before the
 * next stage runs, so a later stage and the handler read it, and a later key overrides an earlier one. Keys are
 * defined, not assigned, so a `__proto__` key is a plain local and cannot replace the prototype of the store. A
 * provided key is typed for everything after it, so when a stage continues, every key an earlier stage provided
 * must still hold its value: a plain function that wrote or deleted one would leave readers with a value their
 * types do not describe, so its `next` throws instead.
 *
 * A stage answers with whatever it returns: the response `next` resolved with, edited, or another response that
 * wraps or replaces it, as an outer stage adding headers to an immutable redirect must. A stage that returns before
 * the rest of the chain it started settles, or throws, waits for that rest before its own result or error
 * propagates, so the handler never runs after the request has been answered.
 *
 * When the rest of the chain fails, the stage decides only if it looked at the promise `next` returned: awaited it,
 * returned it, or called `then`, `catch` or `finally` on it. Then its own result stands, so
 * `try { await next() } catch { return fallback }` answers with the fallback. A stage that never looked at that
 * promise, as in `next(); return new Response('ok')`, did not handle the failure, so the chain rethrows it once the
 * stage has returned, even when the failure comes after. A stage that throws propagates its own error instead.
 */
export async function runMiddlewareChain<TContext extends { readonly locals: object }>(
	middleware: readonly MiddlewareHandler<TContext>[],
	context: TContext,
	terminal: () => Promise<Response>,
): Promise<Response> {
	const provided = new Map<string, unknown>();
	const runFrom = async (position: number): Promise<Response> => {
		if (position >= middleware.length) {
			return terminal();
		}

		let finished = false;
		let started = false;
		let continuation: ContinuationPromise | undefined;
		let restSettled: Promise<void> | undefined;
		let restFailure: { readonly error: unknown } | undefined;
		const next = (locals?: Record<string, unknown>): Promise<Response> => {
			if (finished) {
				throw new Error(
					`[ecopages] Middleware stage ${position} called next() after it returned. Call next() before the stage returns, and return the response it resolves with.`,
				);
			}
			if (started) {
				throw new Error(
					`[ecopages] Middleware stage ${position} called next() more than once. A stage may continue the chain a single time.`,
				);
			}
			started = true;
			assertProvidedLocalsKept(context.locals, provided, position);
			if (locals) {
				defineLocals(context.locals, locals);
				for (const [key, value] of Object.entries(locals)) provided.set(key, value);
			}
			const rest = runFrom(position + 1);
			restSettled = rest.then(
				() => undefined,
				(error: unknown) => {
					restFailure = { error };
				},
			);
			continuation = new ContinuationPromise(rest);
			return continuation;
		};

		let response: Response;
		try {
			response = await middleware[position](context, next);
		} finally {
			finished = true;
			await restSettled;
		}
		if (restFailure && !continuation?.observed) {
			throw restFailure.error;
		}
		return response;
	};

	return runFrom(0);
}

/**
 * The promise a stage's `next` returns, which records whether the stage looked at it.
 *
 * @remarks
 * A `Promise` subclass and not an own `then` on a plain promise: `await` reads `then` only on a promise whose
 * `constructor` is not `Promise`, and `catch` and `finally` call `then`, so overriding `then` sees `await`,
 * `return next()` from an async stage, `Promise.resolve(next())` and `Promise.all([next()])` alike. The species is
 * `Promise`, so the promises `then` derives are plain and do not count. The constructor attaches a handler that
 * does not count as looking, so a promise the stage dropped does not also surface as an unhandled rejection: the
 * chain reports that failure itself.
 */
class ContinuationPromise extends Promise<Response> {
	static override get [Symbol.species](): PromiseConstructor {
		return Promise;
	}

	#observed = false;

	constructor(rest: Promise<Response>) {
		super((resolve) => resolve(rest));
		super.then(undefined, () => undefined);
	}

	get observed(): boolean {
		return this.#observed;
	}

	override then<TResult1 = Response, TResult2 = never>(
		onfulfilled?: ((value: Response) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		this.#observed = true;
		return super.then(onfulfilled, onrejected);
	}
}

function assertProvidedLocalsKept(locals: object, provided: ReadonlyMap<string, unknown>, position: number): void {
	for (const [key, value] of provided) {
		if (!Object.is(Object.getOwnPropertyDescriptor(locals, key)?.value, value)) {
			throw new Error(
				`[ecopages] Middleware stage ${position} changed the local "${key}" that an earlier stage provided with next(). Make the stage with createMiddleware and pass the new value to next({ ${key} }) instead of writing ctx.locals.`,
			);
		}
	}
}

function defineLocals(locals: object, provided: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(provided)) {
		Object.defineProperty(locals, key, { value, writable: true, enumerable: true, configurable: true });
	}
}
