import { ContextSubscriptionRequestEvent } from '@/context/events';
import type { Context, ContextType, UnknownContext } from '@/context/types';
import type { LiteElement } from '@eco-pages/lite-elements';

type SubscribeToContextOptions<T extends UnknownContext> = {
  context: T;
  select?: (context: ContextType<T>) => unknown;
  subscribe?: boolean;
};
/**
 * A decorator to subscribe to a context selector.
 * @param context The context to subscribe to.
 * @param selector The selector to subscribe to. If not provided, the whole context will be subscribed to.
 * @param subscribe @default true Whether to subscribe or unsubscribe. Optional.
 * @returns
 */
export function contextSelector<T extends Context<unknown, unknown>>({
  context,
  select,
  subscribe = true,
}: SubscribeToContextOptions<T>) {
  return (proto: LiteElement, _: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const originalConnectedCallback = proto.connectedCallback;

    proto.connectedCallback = function (this: LiteElement) {
      originalConnectedCallback.call(this);

      this.dispatchEvent(new ContextSubscriptionRequestEvent(context, originalMethod.bind(this), select, subscribe));
    };

    descriptor.value = function (
      ...args: {
        [K in keyof ContextType<T>]: ContextType<T>[K];
      }[]
    ) {
      const result = originalMethod.apply(this, args);
      return result;
    };

    return descriptor;
  };
}
