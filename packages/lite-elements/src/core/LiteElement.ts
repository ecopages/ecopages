import type { RenderInsertPosition } from '@/types';
import type { UnknownContext } from '..';

/**
 * A type that represents an event listener subscription.
 */
export type LiteElementEventListener = {
  target: EventTarget;
  type: string;
  listener: EventListener;
  id: string;
  options?: AddEventListenerOptions;
};

export interface ILiteElement {
  /**
   * A callback that is triggered when the element is connected to the DOM.
   * @param changedProperty The properties that have changed.
   */
  updated(changedProperty: string, oldValue: unknown, newValue: unknown): void;
  /**
   * Subscribes to an event on the target element. The subscription will be removed when the element is disconnected.
   * This method is intended to be mainly used by the `onEvent` decorator.
   * @param target The target element to subscribe to.
   * @param type The event type to subscribe to.
   * @param listener The event listener to subscribe.
   * @param options The options to pass to the event listener.
   * @param id The id to assign to the event subscription.
   */
  subscribeEvent(event: LiteElementEventListener): void;
  /**
   * Subscribes to multiple events on the target element. The subscriptions will be removed when the element is disconnected.
   * @param events The events to subscribe to.
   */
  subscribeEvents(events: LiteElementEventListener[]): void;
  /**
   * Unsubscribes from an event on the target element.
   * This method is intended to be mainly used by the `onEvent` decorator.
   * @param id The id assigned on the event subscription.
   */
  unsubscribeEvent(id: string): void;
  /**
   * Removes all event subscriptions.
   */
  removeAllSubscribedEvents(): void;
  /*
   * Renders a template to the target element.
   * @param target The target element to render the template to.
   * @param template The template to render.
   * @param mode The mode to render the template in.
   */
  renderTemplate(options: {
    target: HTMLElement;
    template: string;
    insert: RenderInsertPosition;
  }): void;
  /**
   * A callback that is triggered when a context is received.
   */
  connectedContextCallback(context: UnknownContext): void;
}

/**
 * A base class for creating custom elements with reactive properties and event subscriptions.
 * @extends HTMLElement
 * @implements ILiteElement
 */
export class LiteElement extends HTMLElement implements ILiteElement {
  private eventSubscriptions = new Map<string, LiteElementEventListener>();

  connectedCallback() {}

  connectedContextCallback(_contextName: UnknownContext): void {}

  disconnectedCallback() {
    this.removeAllSubscribedEvents();
  }

  updated(_changedProperty: string, _oldValue: unknown, _value: unknown) {}

  renderTemplate({
    target = this,
    template,
    insert: mode = 'replace',
  }: {
    target: HTMLElement;
    template: string;
    insert: RenderInsertPosition;
  }) {
    switch (mode) {
      case 'replace':
        target.innerHTML = template;
        break;
      case 'beforeend':
        target.insertAdjacentHTML('beforeend', template);
        break;
      case 'afterbegin':
        target.insertAdjacentHTML('afterbegin', template);
        break;
    }
  }

  public subscribeEvents(events: LiteElementEventListener[]): void {
    for (const event of events) {
      this.subscribeEvent(event);
    }
  }

  public subscribeEvent(event: LiteElementEventListener): void {
    event.target.addEventListener(event.type, event.listener, event.options);
    this.eventSubscriptions.set(event.id, event);
  }

  public unsubscribeEvent(id: string): void {
    const eventSubscription = this.eventSubscriptions.get(id);
    if (eventSubscription) {
      eventSubscription.target.removeEventListener(
        eventSubscription.type,
        eventSubscription.listener,
        eventSubscription.options,
      );
      this.eventSubscriptions.delete(id);
    }
  }

  public removeAllSubscribedEvents(): void {
    for (const eventSubscription of this.eventSubscriptions.values()) {
      eventSubscription.target.removeEventListener(
        eventSubscription.type,
        eventSubscription.listener,
        eventSubscription.options,
      );
    }
    this.eventSubscriptions.clear();
  }
}
