import { LiteElement } from "../LiteElement";
import type { LiteContext } from "./lite-context";
import {
  ContextEventSubscriptionRequest,
  ContextEventProviderRequest,
  type ContextType,
  type UnknownContext,
} from "./proposal";

export function provider<T extends UnknownContext>(contextToProvide: T) {
  return function (classTarget: LiteElement, propertyKey: string) {
    const originalConnectedCallback = classTarget.connectedCallback;

    classTarget["connectedCallback"] = function (this: LiteElement) {
      originalConnectedCallback.call(this);
      this.dispatchEvent(
        new ContextEventProviderRequest(contextToProvide, (context: LiteContext<T>) => {
          (this as any)[propertyKey] = context;
        })
      );
    };
  };
}

export function subscribe({
  context,
  selector,
  subscribe = true,
}: {
  context: UnknownContext;
  selector: keyof ContextType<UnknownContext>;
  subscribe?: boolean;
}) {
  return function (
    classTarget: LiteElement & { context?: LiteContext<UnknownContext> },
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const originalConnectedCallback = classTarget.connectedCallback;

    classTarget["connectedCallback"] = function (
      this: LiteElement & { context: LiteContext<UnknownContext> }
    ) {
      originalConnectedCallback.call(this);
      this.dispatchEvent(
        new ContextEventSubscriptionRequest(context, originalMethod.bind(this), selector, subscribe)
      );
    };

    descriptor.value = function (...args: any[]) {
      const result = originalMethod.apply(this, args);
      return result;
    };

    return descriptor;
  };
}
