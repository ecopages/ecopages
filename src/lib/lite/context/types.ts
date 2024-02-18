// Proposal definitions: github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md#definitions

import type { ContextOnMountEvent } from "@/lib/lite/context/events/context-on-mount";
import type { ContextProviderRequestEvent } from "@/lib/lite/context/events/context-provider-request";
import type { ContextSubscriptionRequestEvent } from "@/lib/lite/context/events/context-subscription-request";

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

/**
 * List of events which can be emitted by a context provider or requester.
 */
export enum ContextEventsTypes {
  SUBSCRIPTION_REQUEST = "context--subscription-request",
  PROVIDER_REQUEST = "context--provider-request",
  ON_MOUNT = "context--on-mount",
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
    [ContextEventsTypes.SUBSCRIPTION_REQUEST]: ContextSubscriptionRequestEvent<UnknownContext>;
    /**
     * A context-request-provider event can be emitted by a context requester to signal
     * that it desires a context value to be provided by a context provider.
     */
    [ContextEventsTypes.PROVIDER_REQUEST]: ContextProviderRequestEvent<UnknownContext>;
    /**
     * A 'context-mount' event can be emitted by a context provider to signal
     * that a context value has been mounted and is available for consumption.
     */
    [ContextEventsTypes.ON_MOUNT]: ContextOnMountEvent;
  }
}
