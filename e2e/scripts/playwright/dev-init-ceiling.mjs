/**
 * Measures how long a dev server takes to print its ready line and enforces a ceiling on it.
 *
 * @remarks
 * Dev init on Bun is dominated by the watcher's initial crawl, which is far slower there than on
 * Node. The Bun parity project sets a ceiling so a regression in that crawl fails the run, instead
 * of passing silently inside Playwright's much longer `webServer.timeout`.
 *
 * @param {object} options
 * @param {RegExp} options.readyPattern - Matches the output line that signals readiness
 * @param {number} options.ceilingMs - Maximum init time in milliseconds
 * @param {(elapsedMs: number) => void} options.onReady - Called once with the init time when the ready line arrives first
 * @param {(elapsedMs: number) => void} options.onExceeded - Called once when the ceiling passes before the ready line
 * @param {() => number} [options.now] - Clock, replaceable in tests
 * @returns {{ onOutput: (text: string) => void, dispose: () => void }}
 */
export function trackDevInit({ readyPattern, ceilingMs, onReady, onExceeded, now = Date.now }) {
	const startedAt = now();
	let settled = false;

	const settle = (callback) => {
		if (settled) {
			return;
		}

		settled = true;
		clearTimeout(timer);
		callback(now() - startedAt);
	};

	const timer = setTimeout(() => settle(onExceeded), ceilingMs);

	return {
		onOutput(text) {
			if (settled || !readyPattern.test(text)) {
				return;
			}

			settle(onReady);
		},
		dispose() {
			settled = true;
			clearTimeout(timer);
		},
	};
}
