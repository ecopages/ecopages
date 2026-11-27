import { fromExternalStore } from '@ecopages/signals';

/**
 * Whether the browser has WebMCP, as the spec names it: `document.modelContext`.
 */
function hasModelContext(): boolean {
	return typeof document !== 'undefined' && Boolean((document as Document & { modelContext?: unknown }).modelContext);
}

/**
 * Whether `document.modelContext` exists, as a signal a tool's `getEnabled` reads, so a tool registers when the
 * object appears after the host connected.
 *
 * @remarks
 * Radiant checks for `document.modelContext` once, when a tool registers, and a polyfill or extension that installs
 * it later fires no event: `@w3c/webmcp-polyfill` defines the property and nothing else. So the signal reads it again
 * when the page finishes loading (a polyfill loaded with `async` or `defer` lands before that) and whenever the page is
 * shown or focused again, which is where an agent or an extension that installed it afterwards looks at the page. It
 * never polls. A polyfill that installs at another moment is seen at the next of those; loading it before the page's
 * own scripts avoids the wait. A signal Radiant stops watching, because every tool host disconnected, stops
 * listening.
 */
export const modelContextPresent = fromExternalStore<boolean>({
	subscribe: (onChange) => {
		const events = [
			[window, 'load'],
			[window, 'pageshow'],
			[window, 'focus'],
			[document, 'visibilitychange'],
		] as const;
		for (const [source, type] of events) source.addEventListener(type, onChange);
		return () => {
			for (const [source, type] of events) source.removeEventListener(type, onChange);
		};
	},
	getSnapshot: hasModelContext,
	getServerSnapshot: () => false,
});
