import { LiteElement, customElement, onEvent, querySelectorAll, ref, refAll } from '@eco-pages/lite-elements';

@customElement('lite-refs')
export class LiteEventEmitter extends LiteElement {
  @ref('ref-container') refContainer!: HTMLDivElement;
  @ref('ref-count') refCount!: HTMLDivElement;
  @refAll('ref-item') refItems!: HTMLDivElement[];
  @querySelectorAll('[data-ref="ref-item"]') refItemsQuery!: HTMLDivElement[];

  renderCountMessage() {
    this.refCount.textContent = `Ref Count: ${this.refItems.length} | Query Count: ${this.refItemsQuery.length}`;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.renderCountMessage();
  }

  @onEvent({ ref: 'create-ref', type: 'click' })
  onEmitButtonClick() {
    this.renderTemplate({
      target: this.refContainer,
      template: `
        <div class="bg-gray-100 text-black p-3 cursor pointer" data-ref="ref-item">
          Ref Item
        </div>
      `,
      insert: 'beforeend',
    });

    this.renderCountMessage();
  }

  @onEvent({ ref: 'ref-item', type: 'click' })
  onRefItemClick(event: Event) {
    (event.target as HTMLDivElement).remove();
    this.renderCountMessage();
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lite-refs': HtmlTag;
    }
  }
}
