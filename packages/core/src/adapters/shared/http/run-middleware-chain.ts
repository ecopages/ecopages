export type MiddlewareHandler<TContext> = (
	context: TContext,
	next: () => Promise<Response>,
) => Response | Promise<Response>;

/**
 * Runs an onion middleware chain and invokes the terminal handler when the chain completes.
 */
export async function runMiddlewareChain<TContext>(
	middleware: readonly MiddlewareHandler<TContext>[],
	context: TContext,
	terminal: () => Promise<Response>,
): Promise<Response> {
	if (middleware.length === 0) {
		return terminal();
	}

	let index = 0;
	const executeNext = async (): Promise<Response> => {
		if (index < middleware.length) {
			const current = middleware[index++];
			return await current(context, executeNext);
		}
		return terminal();
	};

	return executeNext();
}
