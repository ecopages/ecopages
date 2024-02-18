import type { LiteElement } from "@/lib/lite/LiteElement";
import type { LiteContext } from "@/lib/lite/context/lite-context";
import { type UnknownContext, type ContextType } from "@/lib/lite/context/types";
import { ContextSubscriptionRequestEvent } from "@/lib/lite/context/events/context-subscription-request";

/**
 * A decorator to subscribe to a context selector.
 * @param context The context to subscribe to.
 * @param selector The selector to subscribe to. If not provided, the whole context will be subscribed to.
 * @param subscribe @default true Whether to subscribe or unsubscribe. Optional.
 * @returns
 */
export function useContext({
  context,
  selector,
  subscribe = true,
}: {
  context: UnknownContext;
  selector?: keyof ContextType<UnknownContext>;
  subscribe?: boolean;
}) {
  return function (
    proto: LiteElement & { context?: LiteContext<UnknownContext> },
    _: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const originalConnectedCallback = proto.connectedCallback;

    proto["connectedCallback"] = function (
      this: LiteElement & { context: LiteContext<UnknownContext> }
    ) {
      originalConnectedCallback.call(this);
      this.dispatchEvent(
        new ContextSubscriptionRequestEvent(context, originalMethod.bind(this), selector, subscribe)
      );
    };

    descriptor.value = function (...args: any[]) {
      const result = originalMethod.apply(this, args);
      return result;
    };

    return descriptor;
  };
}
