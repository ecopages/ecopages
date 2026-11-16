export type MiddlewareHandler<TContext> = (
	context: TContext,
	next: (locals?: Record<string, unknown>) => Promise<Response>,
) => Response | Promise<Response>;

/** How the rest of the chain behind a stage ended: with a response, or with a failure. */
type Continuation = { ok: true; response: Response } | { ok: false };

/**
 * Runs an onion middleware chain and invokes the terminal handler when the chain completes.
 *
 * @remarks
 * Each stage receives its own `next`, which continues the chain exactly once. A second call throws before the
 * chain advances: a shared cursor would let a stage that calls `next` twice resume the chain after a guard that
 * had already answered, running everything behind the guard, including the terminal handler, a second time.
 * `next` also throws once its stage has returned or thrown, so a stage that answered cannot start the rest of the
 * chain later, from a timer or a callback.
 *
 * A stage continues with `next(locals)`. The chain merges what it provides into `context.locals` before the next
 * stage runs, so a later stage and the handler read it, and a later key overrides an earlier one.
 *
 * A stage that called `next` must return the response `next` resolved with, edited if it likes. The rule keys on
 * the call, not on whether the stage awaited it: a stage that returns first waits for the rest of the chain, which
 * then must have answered with the response the stage returned. Returning another response would answer the
 * request after everything behind the stage had run, discarding what a later guard answered, so it throws. When the
 * rest of the chain threw, the stage's own response stands, so a stage can catch a failed `next` and answer. A
 * stage that throws also waits for the rest of the chain it started before its error propagates.
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
		let continuation: Promise<Continuation> | undefined;
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
			if (provided) {
				Object.assign(context.locals, provided);
			}
			const rest = runFrom(position + 1);
			continuation = rest.then(
				(response): Continuation => ({ ok: true, response }),
				(): Continuation => ({ ok: false }),
			);
			return rest;
		};

		let result: Response;
		try {
			result = await middleware[position](context, next);
		} catch (error) {
			finished = true;
			await continuation;
			throw error;
		}
		finished = true;

		const settled = await continuation;
		if (settled?.ok && settled.response !== result) {
			throw new Error(
				`[ecopages] Middleware stage ${position} called next() and returned a different response. Return the response next() resolved with, editing its headers if needed, or return a response without calling next().`,
			);
		}
		return result;
	};

	return runFrom(0);
}
