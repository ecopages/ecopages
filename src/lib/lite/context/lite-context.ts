import { LiteElement } from "@/lib/lite/LiteElement";
import {
  ContextEventsTypes,
  type ContextSubscription,
  type UnknownContext,
  type ContextType,
} from "@/lib/lite/context/types";
import { ContextOnMountEvent } from "@/lib/lite/context/events/context-on-mount";
import type { ContextProviderRequestEvent } from "@/lib/lite/context/events/context-provider-request";
import type { ContextSubscriptionRequestEvent } from "@/lib/lite/context/events/context-subscription-request";

export class LiteContext<T extends UnknownContext> extends LiteElement {
  protected declare name: string;
  protected declare state: ContextType<T>;

  subscriptions: ContextSubscription<T>[] = [];

  constructor() {
    super();
    this.registerEvents();
  }

  override connectedCallback() {
    super.connectedCallback();
    this.dispatchEvent(new ContextOnMountEvent(this.name));
  }

  setState = (state: Partial<ContextType<T>>, callback?: (state: ContextType<T>) => void) => {
    const newState = { ...this.state, ...state };
    if (callback) callback(newState);
    this.notifySubscribers(newState, this.state);
  };

  getState = () => {
    return this.state;
  };

  private notifySubscribers = (newState: ContextType<T>, prevState: ContextType<T>) => {
    this.subscriptions.forEach((sub) => {
      if (!sub.selector) return this.sendSubscriptionUpdate(sub, newState);
      const newSelected = newState[sub.selector];
      const prevSelected = prevState[sub.selector];
      if (newSelected !== prevSelected) {
        this.sendSubscriptionUpdate(sub, newState);
      }
    });
  };

  sendSubscriptionUpdate = (
    { selector, callback }: ContextSubscription<T>,
    state: ContextType<T>
  ) => {
    if (!selector) callback(state);
    else
      callback({ [selector]: state[selector] } as {
        [K in keyof ContextType<T>]: ContextType<T>[K];
      });
  };

  onSubscriptionRequest = (event: ContextSubscriptionRequestEvent<UnknownContext>) => {
    const { context, callback, subscribe, selector } = event;
    if (context.name !== this.name) return;
    event.stopPropagation();

    if (subscribe) {
      this.subscribe({ selector, callback });
    }

    if (selector) {
      callback({ [selector]: this.state[selector] } as {
        [K in keyof ContextType<T>]: ContextType<T>[K];
      });
    } else {
      callback(this.state as ContextType<T>);
    }
  };

  onProviderRequest = (event: ContextProviderRequestEvent<UnknownContext>) => {
    const { context, callback } = event;
    if (context.name !== this.name) return;
    event.stopPropagation();
    callback(this);
  };

  subscribe = ({ selector, callback }: ContextSubscription<T>) => {
    this.subscriptions.push({ selector, callback });
  };

  registerEvents = () => {
    this.addEventListener(ContextEventsTypes.SUBSCRIPTION_REQUEST, this.onSubscriptionRequest);
    this.addEventListener(ContextEventsTypes.PROVIDER_REQUEST, this.onProviderRequest);
  };
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-context": HtmlTag;
    }
  }
}
