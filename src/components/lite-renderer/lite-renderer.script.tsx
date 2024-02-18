import { customElement } from "@/lib/lite/decorators/custom-element";
import { LiteElement } from "@/lib/lite/LiteElement";
import { reactiveAttribute } from "@/lib/lite/decorators/reactive-attribute";
import { WithKita } from "@/lib/lite/mixins/with-kita";
import { reactiveField } from "@/lib/lite/decorators/reactive-field";
import { onEvent } from "@/lib/lite/decorators/on-event";
import { onUpdated } from "@/lib/lite/decorators/on-updated";
import { querySelector } from "@/lib/lite/decorators/query-selector";

export type LiteRendererProps = {
  text?: string;
};

@customElement("lite-renderer")
export class LiteRenderer extends WithKita(LiteElement) {
  @reactiveAttribute({ type: String, reflect: true }) declare text: string;
  @reactiveField numberOfClicks: number = 1;
  @querySelector("[data-list]") messageList!: HTMLDivElement;

  constructor() {
    super();
    this.renderMessage();
  }

  renderMessage() {
    this.renderTemplate({
      target: this.messageList,
      template: (
        <div class="grig gap-2">
          <h1 class="text-2xl font-bold" safe>
            {`${this.text} - ${this.numberOfClicks} Times`}
          </h1>
          <p>This element has been rendered using @kitajs/html</p>
        </div>
      ),
      mode: "beforeend",
    });
  }

  @onEvent({ type: "click", target: "[data-add]" })
  updateNumberOfClicks() {
    this.numberOfClicks++;
  }

  @onEvent({ type: "click", target: "[data-reset]" })
  resetElement() {
    if (this.numberOfClicks === 1) return;
    this.messageList.innerHTML = "";
    this.numberOfClicks = 1;
  }

  @onUpdated("numberOfClicks")
  addMessage() {
    this.renderMessage();
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-renderer": HtmlTag & LiteRendererProps;
    }
  }
}
