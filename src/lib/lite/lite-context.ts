import { LiteElement } from "@/lib/lite";
import type { PropertyValueMap } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export enum LiteContextEvents {
  CONTEXT_MOUNTED = "__lite-context-mounted__",
}

declare global {
  interface HTMLElementEventMap {
    [LiteContextEvents.CONTEXT_MOUNTED]: CustomEvent<{ "context-id": string }>;
  }
}

export type LiteContextProps = {
  "context-id": string;
};

export type SubscribedElement<State> = {
  selector?: keyof State;
  callback: (state: State | State[keyof State]) => void;
};

@customElement("lite-context")
export class LiteContext<State = Record<string, any>> extends LiteElement {
  @property({ type: String }) "context-id" = "default";
  protected declare state: State;

  subscriptions: SubscribedElement<State>[] = [];

  override firstUpdated(
    _changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
  ): void {
    super.firstUpdated(_changedProperties);
    this.onMount();
  }

  private onMount() {
    const consumers = this.querySelectorAll(`[context-id="${this["context-id"]}"`);
    const onMountEvent = new CustomEvent(LiteContextEvents.CONTEXT_MOUNTED, {
      detail: { "context-id": this["context-id"] },
    });
    consumers.forEach((consumer) => {
      consumer.dispatchEvent(onMountEvent);
    });
  }

  setState = (state: Partial<State>, callback?: (state: State) => void) => {
    const newState = { ...this.state, ...state };
    if (callback) callback(newState);
    this.notifySubScribers(newState, this.state);
  };

  getState = () => {
    return this.state;
  };

  private notifySubScribers = (newState: State, prevState: State) => {
    this.subscriptions.forEach((sub) => {
      if (!sub.selector) return sub.callback(newState);
      const newSelected = newState[sub.selector];
      const prevSelected = prevState[sub.selector];
      if (newSelected !== prevSelected) {
        sub.callback(newSelected);
      }
    });
  };

  subscribe = ({ selector, callback }: SubscribedElement<State>) => {
    this.subscriptions.push({ selector, callback });
  };

  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-context": HtmlTag & LiteContextProps;
    }
  }
}
