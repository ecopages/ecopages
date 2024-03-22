import { customElement } from "@/lib/lite/decorators/custom-element";
import { LiteElement } from "@/lib/lite/LiteElement";
import { reactiveAttribute } from "@/lib/lite/decorators/reactive-attribute";
import { WithKita } from "@/lib/lite/mixins/with-kita";
import { reactiveField } from "@/lib/lite/decorators/reactive-field";
import { onEvent } from "@/lib/lite/decorators/on-event";
import { onUpdated } from "@/lib/lite/decorators/on-updated";
import { querySelector } from "@/lib/lite/decorators/query-selector";
import { Message } from "./lite-renderer.templates.kita";
import type { RenderInsertPosition } from "@/lib/lite/types";

export type LiteRendererProps = {
  text?: string;
  "replace-on-load"?: boolean;
};

@customElement("lite-renderer")
export class LiteRenderer extends WithKita(LiteElement) {
  @reactiveAttribute({ type: String, reflect: true }) declare text: string;
  @reactiveAttribute({ type: Boolean, reflect: true }) declare "replace-on-load": boolean;

  @reactiveField numberOfClicks: number = 1;
  @querySelector("[data-list]") messageList!: HTMLDivElement;

  constructor() {
    super();
    console.log(this["replace-on-load"]);
    if (this["replace-on-load"]) {
      this.messageList.innerHTML = "";
      this.renderMessage("replace");
    }
  }

  renderMessage(insert: RenderInsertPosition = "beforeend") {
    this.renderTemplate({
      target: this.messageList,
      template: <Message text={this.text} numberOfClicks={this.numberOfClicks} />,
      insert,
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
    this.messageList.scrollTop = this.messageList.scrollHeight;
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-renderer": HtmlTag & LiteRendererProps;
    }
  }
}
