import type { LiteElement, LiteElementEventListener } from '@/core/lite-element';

type OnEventConfig = Pick<LiteElementEventListener, 'type' | 'options'> &
  (
    | {
        selector: string;
      }
    | {
        ref: string;
      }
  );

/**
 * A decorator to subscribe to an event on the target element.
 * The event listener will be automatically unsubscribed when the element is disconnected.
 *
 * Note: This decorator uses event delegation, which means it relies on event bubbling.
 * Therefore, it will not work with events that do not bubble, such as `focus`, `blur`, `load`, `unload`, `scroll`, etc.
 * For focus and blur events, consider using `focusin` and `focusout` which are similar but do bubble.
 *
 * @param eventConfig The event configuration.
 * @param eventConfig.selectors The CSS selector(s) of the target element(s).
 * @param eventConfig.ref The data-ref attribute of the target element.
 * @param eventConfig.type The type of the event to listen for.
 * @param eventConfig.options Optional. An options object that specifies characteristics about the event listener.
 */
export function onEvent(eventConfig: OnEventConfig) {
  return (proto: LiteElement, _: string, descriptor: PropertyDescriptor) => {
    const originalConnectedCallback = proto.connectedCallback;

    const selector = 'selector' in eventConfig ? eventConfig.selector : `[data-ref="${eventConfig.ref}"]`;

    const originalMethod = descriptor.value;
    const subscriptionId = `${eventConfig.type}-${selector}`;

    proto.connectedCallback = function (this: LiteElement) {
      originalConnectedCallback.call(this);

      this.subscribeEvent({
        id: subscriptionId,
        selector: selector,
        type: eventConfig.type,
        listener: originalMethod.bind(this),
        options: eventConfig?.options ?? undefined,
      });
    };

    return descriptor;
  };
}
