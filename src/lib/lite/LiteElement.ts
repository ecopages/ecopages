export type LiteElementEventListener = {
  target: EventTarget;
  type: string;
  listener: EventListener;
  options?: AddEventListenerOptions;
};

export interface ILightElement {
  /**
   * A callback that is triggered when the element is connected to the DOM.
   * @param changedProperty The properties that have changed.
   */
  updated(changedProperty: string, oldValue: unknown, newValue: unknown): void;
  /**
   * Subscribes to an event on the target element. The subscription will be removed when the element is disconnected.
   * @param target The target element to subscribe to.
   * @param type The event type to subscribe to.
   * @param listener The event listener to subscribe.
   * @param options The options to pass to the event listener.
   */
  subscribeEvent(event: LiteElementEventListener): void;
  /**
   * Subscribes to multiple events on the target element. The subscriptions will be removed when the element is disconnected.
   * @param events The events to subscribe to.
   */
  subscribeEvents(events: LiteElementEventListener[]): void;
  /**
   * Unsubscribes from an event on the target element.
   * @param target The target element to unsubscribe from.
   * @param type The event type to unsubscribe from.
   * @param listener The event listener to unsubscribe.
   */
  unsubscribeEvent(target: EventTarget, type: string, listener: EventListener): void;
  /**
   * Removes all event subscriptions.
   */
  removeAllSubscribedEvents(): void;
  /**
   * Subscribes to an updated callback when a watched property changes.
   * @param watch The property to watch.
   * @param callback The callback to trigger when the property changes.
   */
  subscribeUpdate(watch: string, callback: () => void): void;
}

/**
 * A base class for creating custom elements with reactive properties and event subscriptions.
 * @extends HTMLElement
 * @implements ILightElement
 */
export class LiteElement extends HTMLElement implements ILightElement {
  private eventSubscriptions: LiteElementEventListener[] = [];
  private onUpdatedCallbacks: { watch: string; callback: () => void }[] = [];

  constructor() {
    super();
  }

  connectedCallback() {}

  disconnectedCallback() {
    this.removeAllSubscribedEvents();
  }

  updated(changedProperty: string, oldValue: unknown, value: unknown) {}

  public subscribeEvent({ target, type, listener, options }: LiteElementEventListener): void {
    target.addEventListener(type, listener, options);
    this.eventSubscriptions.push({ target, type, listener });
  }

  public subscribeEvents(events: LiteElementEventListener[]): void {
    events.forEach((event) => this.subscribeEvent(event));
  }

  public subscribeUpdate(watch: string, callback: () => void): void {
    this.onUpdatedCallbacks.push({ watch, callback });
  }

  public unsubscribeEvent(target: EventTarget, type: string, listener: EventListener): void {
    target.removeEventListener(type, listener);
    this.eventSubscriptions = this.eventSubscriptions.filter(
      (eventSubscription) =>
        eventSubscription.target !== target ||
        eventSubscription.type !== type ||
        eventSubscription.listener !== listener
    );
  }

  public removeAllSubscribedEvents(): void {
    this.eventSubscriptions.forEach((eventSubscription) => {
      eventSubscription.target.removeEventListener(
        eventSubscription.type,
        eventSubscription.listener
      );
    });
    this.eventSubscriptions = [];
  }
}
