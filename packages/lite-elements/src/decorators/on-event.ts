import type { LiteElement } from '@/core/LiteElement';

/**
 * A decorator to subscribe to an event on the target element.
 * The event listener will be automatically unsubscribed when the element is disconnected.
 * @param eventConfig The event configuration.
 */
export function onEvent(eventConfig: {
  target: string;
  type: string;
  options?: AddEventListenerOptions;
}) {
  return (proto: LiteElement, _: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const originalConnectedCallback = proto.connectedCallback;
    const originalDisconnectedCallback = proto.disconnectedCallback;

    const subscriptionId = `${eventConfig.target}-${eventConfig.type}`;

    proto.connectedCallback = function (this: LiteElement) {
      const eventTarget = this.querySelector(eventConfig.target);
      originalConnectedCallback.call(this);
      if (!eventTarget) {
        throw new Error(`Could not find element with selector ${eventConfig.target}`);
      }
      this.subscribeEvent({
        id: subscriptionId,
        target: eventTarget,
        type: eventConfig.type,
        listener: originalMethod.bind(this),
        options: eventConfig?.options ?? undefined,
      });
    };

    proto.disconnectedCallback = function (this: LiteElement) {
      originalDisconnectedCallback.call(this);
      this.unsubscribeEvent(subscriptionId);
    };

    return descriptor;
  };
}
