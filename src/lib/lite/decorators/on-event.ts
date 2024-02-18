import type { LiteElement } from "@/lib/lite/LiteElement";

/**
 * A decorator to subscribe to an event on the target element.
 * The event listener will be automatically unsubscribed when the element is disconnected.
 * @param eventConfig The event configuration.
 */
export function onEvent(eventConfig: { target: string; type: string }) {
  return function (proto: LiteElement, _: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const originalConnectedCallback = proto.connectedCallback;
    const originalDisconnectedCallback = proto.disconnectedCallback;

    proto.connectedCallback = function (this: LiteElement) {
      originalConnectedCallback.call(this);
      const eventTarget = this.querySelector(eventConfig.target);
      if (!eventTarget) {
        throw new Error(`Could not find element with selector ${eventConfig.target}`);
      }
      this.subscribeEvent({
        target: eventTarget,
        type: eventConfig?.type,
        listener: originalMethod.bind(this),
      });
    };

    proto.disconnectedCallback = function (this: LiteElement) {
      originalDisconnectedCallback.call(this);
      this.unsubscribeEvent(this, eventConfig.type, originalMethod);
    };

    return descriptor;
  };
}
