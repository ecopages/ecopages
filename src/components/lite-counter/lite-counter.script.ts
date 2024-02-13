import { LiteElement, onEvent, onUpdated, querySelector } from "@/lib/lite";
import { customElement, property } from "lit/decorators.js";

export type LiteCounterProps = {
  count?: number;
};

@customElement("lite-counter")
export class LiteCounter extends LiteElement {
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
  namespace JSX {
    interface IntrinsicElements {
      "lite-counter": HtmlTag & LiteCounterProps;
    }
  }
}
