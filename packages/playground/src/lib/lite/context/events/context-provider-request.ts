import type { LiteContext } from '../lite-context';
import { ContextEventsTypes, type UnknownContext } from '../types';

/**
 * An event fired by a context requester to signal it desires a context value to be provided by a context provider.
 */
export class ContextProviderRequestEvent<T extends UnknownContext> extends Event {
  public constructor(
    public readonly context: T,
    public readonly callback: (value: LiteContext<T>) => void,
  ) {
    super(ContextEventsTypes.PROVIDER_REQUEST, {
      bubbles: true,
      composed: true,
    });
  }
}
