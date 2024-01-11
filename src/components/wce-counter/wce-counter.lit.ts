import { LitElement, html, unsafeCSS } from "lit";
import { customElement, property } from "lit/decorators.js";
import { postcssMacro } from "macros/postcss.macro" with { type: 'macro' };


export interface WceCounterProps {
  counterText?: string;
  count?: number;
}

@customElement("wce-counter")
export class WceCounter extends LitElement implements WceCounterProps {
  static override styles = [unsafeCSS(postcssMacro("@/src/components/wce-counter/wce-counter.styles.css"))];

  @property({ type: String }) counterText = "Count";
  @property({ type: Number }) count = 0;

  override render() {
    return html`
      <button @click=${() => this.count++}>Increment</button>
      <div class="wce-counter__count">${this.counterText}: ${this.count}</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wce-counter": WceCounter;
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "wce-counter": HtmlTag & WceCounterProps;
    }
  }
}