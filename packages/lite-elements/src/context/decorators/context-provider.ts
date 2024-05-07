import { ContextProviderRequestEvent } from '@/context/events/context-provider-request';
import type { LiteContext } from '@/context/lite-context';
import type { UnknownContext } from '@/context/types';
import type { LiteElement } from '@/core/LiteElement';

/**
 * A decorator to provide a context to the target element.
 * @param contextToProvide
 * @returns
 */
export function contextProvider<T extends UnknownContext>(contextToProvide: T) {
  return (proto: LiteElement, propertyKey: string) => {
    const originalConnectedCallback = proto.connectedCallback;

    proto.connectedCallback = function (this: LiteElement) {
      originalConnectedCallback.call(this);
      this.dispatchEvent(
        new ContextProviderRequestEvent(contextToProvide, (context: LiteContext<T>) => {
          (this as any)[propertyKey] = context;
          this.connectedContextCallback(contextToProvide.name);
        }),
      );
    };
  };
}
