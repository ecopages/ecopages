export type StagedStylesheets = {
	/** Every stylesheet link the pipeline staged while the fixture was active, in order. */
	links: HTMLLinkElement[];
	/** Fires `load` on a staged link, as the browser does once its fetch finishes. */
	finish(link: HTMLLinkElement): void;
	/** Restores `document.head.appendChild`. */
	stop(): void;
};

/**
 * Takes over how the head's stylesheet fetches end, so a test decides when a navigation may continue.
 *
 * @remarks
 * The pipeline waits for the `load` of every incoming stylesheet, and a test URL never answers.
 * A link that `defer` accepts is recorded but not attached, so the browser never fetches it and the
 * wait stays open until the test calls `finish`. Attaching it would end the wait with an `error`
 * on the first 404. Every other stylesheet is attached and loads on the next microtask.
 */
export function stageStylesheets(defer: (link: HTMLLinkElement) => boolean = () => false): StagedStylesheets {
	const links: HTMLLinkElement[] = [];
	const originalAppendChild = document.head.appendChild.bind(document.head);
	const finish = (link: HTMLLinkElement) => link.dispatchEvent(new Event('load'));
	document.head.appendChild = ((node: Node) => {
		if (!(node instanceof HTMLLinkElement) || node.rel !== 'stylesheet') return originalAppendChild(node);
		links.push(node);
		if (defer(node)) return node;
		const attached = originalAppendChild(node);
		queueMicrotask(() => finish(node));
		return attached;
	}) as typeof document.head.appendChild;
	return {
		links,
		finish,
		stop: () => {
			Reflect.deleteProperty(document.head, 'appendChild');
		},
	};
}
