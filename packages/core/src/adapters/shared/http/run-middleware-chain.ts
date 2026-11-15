export type MiddlewareHandler<TContext> = (
	context: TContext,
	next: () => Promise<Response>,
) => Response | Promise<Response>;

/**
 * Runs an onion middleware chain and invokes the terminal handler when the chain completes.
 *
 * @remarks
 * Each stage receives its own `next`, which continues the chain exactly once. A second call throws before the
 * chain advances. A shared cursor would let a stage that calls `next` twice resume the chain after a guard that
 * had already answered, running everything behind the guard, including the terminal handler, a second time.
 */
export async function runMiddlewareChain<TContext>(
	middleware: readonly MiddlewareHandler<TContext>[],
	context: TContext,
	terminal: () => Promise<Response>,
): Promise<Response> {
	const runFrom = async (position: number): Promise<Response> => {
		if (position >= middleware.length) {
			return terminal();
		}

		let continued = false;
		const next = (): Promise<Response> => {
			if (continued) {
				throw new Error(
					`[ecopages] Middleware stage ${position} called next() more than once. A stage may continue the chain a single time.`,
				);
			}
			continued = true;
			return runFrom(position + 1);
		};

		return await middleware[position](context, next);
	};

	return runFrom(0);
}
