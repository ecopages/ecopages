// Proposal definitions: github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md#definitions

import type { LiteContext } from "./lite-context";

/**
 * A Context object defines an optional initial value for a Context, as well as a name identifier for debugging purposes.
 */
export type Context<T extends Record<string, unknown>> = {
  name: string;
  initialValue?: T;
};

/**
 * An unknown context type
 */
export type UnknownContext = Context<Record<string, unknown>>;

/**
 * A helper type which can extract a Context value type from a Context type
 */
export type ContextType<T extends UnknownContext> = T extends Context<infer Y> ? Y : never;

/**
 * A function which creates a Context value object
 */
export function createContext<T extends Record<string, unknown>>(name: string, initialValue: T) {
  return {
    name,
    initialValue,
  } as Context<T>;
}

/**
 * A callback which is provided by a context requester and is called with the value satisfying the request.
 * This callback can be called multiple times by context providers as the requested value is changed.
 */
export type ContextCallback<ValueType> = (value: ValueType, unsubscribe?: () => void) => void;

export enum ContextEventsTypes {
  SUBSCRIPTION_REQUEST = "context--subscription-request",
  PROVIDER_REQUEST = "context--provider-request",
  ON_MOUNT = "context--on-mount",
}

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
export class ContextEventSubscriptionRequest<T extends UnknownContext> extends Event {
  public constructor(
    public readonly context: T,
    public readonly callback: (
      value: ContextType<T> | { [K in keyof ContextType<T>]: ContextType<T>[K] }
    ) => void,
    public readonly selector?: keyof ContextType<T>,
    public readonly subscribe?: boolean
  ) {
    super(ContextEventsTypes.SUBSCRIPTION_REQUEST, { bubbles: true, composed: true });
  }
}

/**
 * An event fired by a context requester to signal it desires a context value to be provided by a context provider.
 */
export class ContextEventProviderRequest<T extends UnknownContext> extends Event {
  public constructor(
    public readonly context: T,
    public readonly callback: (value: LiteContext<T>) => void
  ) {
    super(ContextEventsTypes.PROVIDER_REQUEST, { bubbles: true, composed: true });
  }
}

/**
 * An event fired by a context provider to signal that a context value has been mounted and is available for consumption.
 */
export class ContextEventOnMount extends CustomEvent<{ name: string }> {
  public constructor(name: string) {
    super(ContextEventsTypes.ON_MOUNT, { detail: { name }, bubbles: true, composed: true });
  }
}
/**
 * A type which represents a subscription to a context value.
 */
export type ContextSubscription<State extends UnknownContext> = {
  selector?: keyof ContextType<State>;
  callback: (state: Partial<ContextType<State>>) => void;
};

declare global {
  interface HTMLElementEventMap {
    /**
     * A 'context-request-subscription' event can be emitted by any element which desires
     * a context value to be injected by an external provider.
     */
    [ContextEventsTypes.SUBSCRIPTION_REQUEST]: ContextEventSubscriptionRequest<UnknownContext>;
    /**
     * A context-request-provider event can be emitted by a context requester to signal
     * that it desires a context value to be provided by a context provider.
     */
    [ContextEventsTypes.PROVIDER_REQUEST]: ContextEventProviderRequest<UnknownContext>;
    /**
     * A 'context-mount' event can be emitted by a context provider to signal
     * that a context value has been mounted and is available for consumption.
     */
    [ContextEventsTypes.ON_MOUNT]: ContextEventOnMount;
  }
}
