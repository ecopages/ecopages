import { RadiantElement, customElement, onEvent, query } from '@ecopages/radiant';

@customElement('lite-refs')
export class LiteEventEmitter extends RadiantElement {
  @query({ ref: 'ref-container' }) refContainer!: HTMLDivElement;
  @query({ ref: 'ref-count' }) refCount!: HTMLDivElement;
  @query({ ref: 'ref-item', all: true }) refItems!: HTMLDivElement[];

  renderCountMessage() {
    this.refCount.textContent = `Ref Count: ${this.refItems.length}`;
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
