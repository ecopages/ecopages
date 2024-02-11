import { LitElement, type PropertyValueMap } from "lit";

export type LightElementEventListener = {
  target: EventTarget;
  type: string;
  listener: EventListener;
  options?: AddEventListenerOptions;
};

type Constructor<T = {}> = new (...args: any[]) => T;

export interface ILightElement extends LitElement {
  /**
   * Subscribes to an event on the target element. The subscription will be removed when the element is disconnected.
   * @param target The target element to subscribe to.
   * @param type The event type to subscribe to.
   * @param listener The event listener to subscribe.
   * @param options The options to pass to the event listener.
   */
  subscribeEvent(event: LightElementEventListener): void;
  /**
   * Subscribes to multiple events on the target element. The subscriptions will be removed when the element is disconnected.
   * @param events The events to subscribe to.
   */
  subscribeEvents(events: LightElementEventListener[]): void;
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
 * A mixin to power up a LitElement with:
 * - Event subscription management
 * - A render root that is the element itself
 * - An updated callback that triggers when a watched property changes
 * @param Base The LitElement class to power up.
 * @returns The powered up LitElement class.
 */
export const Light = <T extends Constructor<LitElement>>(Base: T) => {
  class LightElementClass extends Base implements ILightElement {
    private eventSubscriptions: LightElementEventListener[] = [];
    private onUpdatedCallbacks: { watch: string; callback: () => void }[] = [];

    override disconnectedCallback() {
      super.disconnectedCallback();
      this.removeAllSubscribedEvents();
    }

    protected override updated(
      _changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
    ): void {
      super.updated(_changedProperties);
      this.onUpdatedCallbacks.forEach((record) => {
        if (_changedProperties.has(record.watch)) {
          record.callback();
        }
      });
    }

    public subscribeEvent({ target, type, listener, options }: LightElementEventListener): void {
      target.addEventListener(type, listener, options);
      this.eventSubscriptions.push({ target, type, listener });
    }

    public subscribeEvents(events: LightElementEventListener[]): void {
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

    protected override createRenderRoot(): HTMLElement | DocumentFragment {
      return this;
    }
  }

  return LightElementClass;
};

export class LightElement extends Light(LitElement) {}
