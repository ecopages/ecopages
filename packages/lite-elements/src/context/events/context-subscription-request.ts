import { ContextEventsTypes, type ContextType, type UnknownContext } from '@/context/types';

/**
 * An event fired by a context requester to signal it desires a named context.
 *
 * A provider should inspect the `context` property of the event to determine if it has a value that can
 * satisfy the request, calling the `callback` with the requested value if so.
 *
 * If the requested context event contains a truthy `subscribe` value, then a provider can call the callback
 * multiple times if the value is changed, if this is the case the provider should pass an `unsubscribe`
 * function to the callback which requesters can invoke to indicate they no longer wish to receive these updates.
 *
 * It accepts a `selector` property which can be used to request a specific property of the context value.
 */
export class ContextSubscriptionRequestEvent<T extends UnknownContext> extends Event {
  public constructor(
    public readonly context: T,
    public readonly callback: (value: ContextType<T> | { [K in keyof ContextType<T>]: ContextType<T>[K] }) => void,
    public readonly selector?: keyof ContextType<T>,
    public readonly subscribe?: boolean,
  ) {
    super(ContextEventsTypes.SUBSCRIPTION_REQUEST, {
      bubbles: true,
      composed: true,
    });
  }
}
