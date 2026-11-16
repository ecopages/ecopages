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
 * defined, not assigned, so a `__proto__` key is a plain local and cannot replace the prototype of the store.
 *
 * A stage answers with whatever it returns: the response `next` resolved with, edited, or another response that
 * wraps or replaces it, as an outer stage adding headers to an immutable redirect must. A stage that returns before
 * the rest of the chain it started settles, or throws, waits for that rest before its own result or error
 * propagates, so the handler never runs after the request has been answered.
 */
export async function runMiddlewareChain<TContext extends { readonly locals: object }>(
	middleware: readonly MiddlewareHandler<TContext>[],
	context: TContext,
	terminal: () => Promise<Response>,
): Promise<Response> {
	const runFrom = async (position: number): Promise<Response> => {
		if (position >= middleware.length) {
			return terminal();
		}

		let finished = false;
		let continuation: Promise<unknown> | undefined;
		const next = (provided?: Record<string, unknown>): Promise<Response> => {
			if (finished) {
				throw new Error(
					`[ecopages] Middleware stage ${position} called next() after it returned. Call next() before the stage returns, and return the response it resolves with.`,
				);
			}
			if (continuation) {
				throw new Error(
					`[ecopages] Middleware stage ${position} called next() more than once. A stage may continue the chain a single time.`,
				);
			}
			continuation = Promise.resolve();
			if (provided) {
				defineLocals(context.locals, provided);
			}
			const rest = runFrom(position + 1);
			continuation = rest.catch(() => undefined);
			return rest;
		};

		try {
			return await middleware[position](context, next);
		} finally {
			finished = true;
			await continuation;
		}
	};

	return runFrom(0);
}

function defineLocals(locals: object, provided: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(provided)) {
		Object.defineProperty(locals, key, { value, writable: true, enumerable: true, configurable: true });
	}
}
