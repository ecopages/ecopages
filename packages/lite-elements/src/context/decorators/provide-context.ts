import { LiteContext } from '@/context/context-provider';
import type { ContextType, UnknownContext } from '@/context/types';
import type { LiteElement } from '@eco-pages/lite-elements';

type CreateContextOptions<T extends UnknownContext> = {
  context: UnknownContext;
  initialValue?: ContextType<T>;
};

/**
 * A decorator to provide a context to the target element.
 * @param contextToProvide
 * @returns
 */
export function provideContext<T extends UnknownContext>({ context, initialValue }: CreateContextOptions<T>) {
  return (proto: LiteElement, propertyKey: string) => {
    const originalConnectedCallback = proto.connectedCallback;

    proto.connectedCallback = function (this: LiteElement) {
      originalConnectedCallback.call(this);
      (this as any)[propertyKey] = new LiteContext<T>(this, { context, initialValue });
      this.connectedContextCallback(context);
    };
  };
}
