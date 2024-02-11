import { LightElement, onEvent, onUpdated, querySelector } from "@/lib/lit-light";
import { customElement, property } from "lit/decorators.js";

export type EcoCounterProps = {
  count?: number;
};

@customElement("eco-counter")
export class EcoCounter extends LightElement {
  @property({ type: Number }) count = 0;
  @querySelector("[data-text]") countText!: HTMLElement;

  @onEvent({ target: "[data-decrement]", type: "click" })
  decrement() {
    this.count--;
  }

  @onEvent({ target: "[data-increment]", type: "click" })
  increment() {
    this.count++;
  }

  @onUpdated("count")
  updateCount() {
    this.countText.textContent = this.count.toString();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "eco-counter": EcoCounter;
  }
  namespace JSX {
    interface IntrinsicElements {
      "eco-counter": HtmlTag & EcoCounterProps;
    }
  }
}
