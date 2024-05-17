import { ContextRequestEvent } from '@/context/events';
import type { UnknownContext } from '@/context/types';
import type { LiteElement } from '@eco-pages/lite-elements';

/**
 * A decorator to provide a context to the target element.
 * @param contextToProvide
 * @returns
 */
export function consumeContext(contextToProvide: UnknownContext) {
  return (proto: LiteElement, propertyKey: string) => {
    const originalConnectedCallback = proto.connectedCallback;

    proto.connectedCallback = function (this: LiteElement) {
      originalConnectedCallback.call(this);
      this.dispatchEvent(
        new ContextRequestEvent(contextToProvide, (context) => {
          (this as any)[propertyKey] = context;
          this.connectedContextCallback(contextToProvide);
        }),
      );
    };
  };
}
