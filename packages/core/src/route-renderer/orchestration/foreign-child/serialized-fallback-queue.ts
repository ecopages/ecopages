export type SerializedFallbackQueue = {
	tail: Promise<void>;
};

export function createSerializedFallbackQueue(): SerializedFallbackQueue {
	return { tail: Promise.resolve() };
}

/** Runs render work one at a time while the runtime relies on a shared context stack. */
export async function runWithSerializedFallback<T>(queue: SerializedFallbackQueue, run: () => Promise<T>): Promise<T> {
	const previous = queue.tail;
	let release!: () => void;
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});
	queue.tail = previous.then(() => next);
	await previous;

	try {
		return await run();
	} finally {
		release();
	}
}
