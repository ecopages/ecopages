import { customElement } from "@/lib/lite/decorators/custom-element";
import { LiteElement } from "@/lib/lite/LiteElement";
import { onEvent } from "@/lib/lite/decorators/on-event";
import { querySelector } from "@/lib/lite/decorators/query-selector";
import { onUpdated } from "@/lib/lite/decorators/on-updated";
import { reactiveAttribute } from "@/lib/lite/decorators/reactive-attribute";

export type LiteCounterProps = {
  count?: number;
};

@customElement("lite-counter")
export class LiteCounter extends LiteElement {
  @reactiveAttribute({ type: Number, reflect: true }) declare count: number;
  @querySelector("[data-text]") countText!: HTMLElement;

  @onEvent({ target: "[data-decrement]", type: "click" })
  decrement() {
    if (this.count > 0) this.count--;
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
