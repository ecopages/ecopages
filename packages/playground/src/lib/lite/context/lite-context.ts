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
  protected declare context: ContextType<T>;

  subscriptions: ContextSubscription<T>[] = [];

  constructor() {
    super();
    this.registerEvents();
  }

  override connectedCallback() {
    super.connectedCallback();
  }

  setContext = (update: Partial<ContextType<T>>, callback?: (context: ContextType<T>) => void) => {
    const newContext = { ...this.context, ...update };
    if (callback) callback(newContext);
    this.notifySubscribers(newContext, this.context);
  };

  getContext = () => {
    return this.context;
  };

  private notifySubscribers = (newContext: ContextType<T>, prevContext: ContextType<T>) => {
    this.subscriptions.forEach((sub) => {
      if (!sub.selector) return this.sendSubscriptionUpdate(sub, newContext);
      const newSelected = newContext[sub.selector];
      const prevSelected = prevContext[sub.selector];
      if (newSelected !== prevSelected) {
        this.sendSubscriptionUpdate(sub, newContext);
      }
    });
  };

  sendSubscriptionUpdate = (
    { selector, callback }: ContextSubscription<T>,
    context: ContextType<T>
  ) => {
    if (!selector) callback(context);
    else
      callback({ [selector]: context[selector] } as {
        [K in keyof ContextType<T>]: ContextType<T>[K];
      });
  };

  onSubscriptionRequest = (event: ContextSubscriptionRequestEvent<UnknownContext>) => {
    const { context, callback, subscribe, selector, target } = event;
    if (context.name !== this.name) return;
    event.stopPropagation();

    (target as HTMLElement).dispatchEvent(new ContextOnMountEvent(this.name));

    if (subscribe) {
      this.subscribe({ selector, callback });
    }

    if (selector) {
      callback({ [selector]: this.context[selector] } as {
        [K in keyof ContextType<T>]: ContextType<T>[K];
      });
    } else {
      callback(this.context as ContextType<T>);
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
