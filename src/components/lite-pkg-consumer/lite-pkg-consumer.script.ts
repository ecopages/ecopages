import { LiteElement, querySelector } from "@/lib/lite";
import { LiteContextEvents, LiteContext } from "@/lib/lite/lite-context";

import { customElement, property } from "lit/decorators.js";

export type LitePkgConsumerProps = {
  "context-id": string;
};

@customElement("lite-pkg-consumer")
export class LitePkgConsumer extends LiteElement {
  @property({ type: String }) declare ["context-id"]: string;
  @querySelector("[data-name]") packageName!: HTMLSpanElement;

  override connectedCallback(): void {
    super.connectedCallback();
    console.dir(this);
    const context = document.querySelector(
      `lite-pkg-context[context-id="${this["context-id"]}"]`
    ) as LiteContext;

    if (!context) {
      throw new Error(`No context found with id: ${this["context-id"]}`);
    }

    context.subscriptions.push({
      selector: "name",
      callback: (name) => {
        this.packageName.innerHTML = name as string;
      },
    });
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-pkg-consumer": HtmlTag & LitePkgConsumerProps;
    }
  }
}
