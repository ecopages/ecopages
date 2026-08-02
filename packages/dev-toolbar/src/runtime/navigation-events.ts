export type NavigationLifecycleEvent = 'eco:before-swap' | 'eco:after-swap' | 'eco:page-load';

type NavigationListener = () => void;

type EventSubscription = {
	listeners: Set<NavigationListener>;
	dispatch: () => void;
};

const subscriptionsByDocument = new WeakMap<Document, Map<NavigationLifecycleEvent, EventSubscription>>();

/**
 * Shares one DOM listener per navigation event while allowing toolbar panels to subscribe independently.
 *
 * @remarks
 * The toolbar has several panels that observe the same lifecycle. Keeping the
 * dispatcher on the document avoids exceeding the browser/Node EventTarget
 * listener limit while preserving per-panel teardown.
 */
export function subscribeToNavigationEvents(
	doc: Document,
	events: readonly NavigationLifecycleEvent[],
	listener: NavigationListener,
): () => void {
	const subscriptions = subscriptionsByDocument.get(doc) ?? new Map<NavigationLifecycleEvent, EventSubscription>();
	subscriptionsByDocument.set(doc, subscriptions);
	const attached: EventSubscription[] = [];

	for (const event of events) {
		let subscription = subscriptions.get(event);
		if (!subscription) {
			const listeners = new Set<NavigationListener>();
			const dispatch = () => {
				for (const subscriber of [...listeners]) {
					subscriber();
				}
			};
			subscription = { listeners, dispatch };
			subscriptions.set(event, subscription);
			doc.addEventListener(event, dispatch);
		}

		subscription.listeners.add(listener);
		attached.push(subscription);
	}

	return () => {
		for (const subscription of attached) {
			subscription.listeners.delete(listener);
		}

		for (const [event, subscription] of subscriptions) {
			if (subscription.listeners.size > 0) {
				continue;
			}

			doc.removeEventListener(event, subscription.dispatch);
			subscriptions.delete(event);
		}

		if (subscriptions.size === 0) {
			subscriptionsByDocument.delete(doc);
		}
	};
}
