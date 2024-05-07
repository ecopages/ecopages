import {
  LiteElement,
  type RenderInsertPosition,
  WithKita,
  customElement,
  onEvent,
  onUpdated,
  querySelector,
  reactiveAttribute,
  reactiveField,
} from '@eco-pages/lite-elements';

import { Message } from './lite-renderer.templates.kita';

export type LiteRendererProps = {
  text?: string;
  'replace-on-load'?: boolean;
};

@customElement('lite-renderer')
export class LiteRenderer extends WithKita(LiteElement) {
  @reactiveAttribute({ type: String, reflect: true }) declare text: string;
  @reactiveAttribute({ type: Boolean, reflect: true })
  declare 'replace-on-load': boolean;

  @reactiveField numberOfClicks = 1;
  @querySelector('[data-list]') messageList!: HTMLDivElement;

  constructor() {
    super();
    if (this['replace-on-load']) {
      this.messageList.innerHTML = '';
      this.renderMessage('replace');
    }
  }

  renderMessage(insert: RenderInsertPosition = 'beforeend') {
    this.renderTemplate({
      target: this.messageList,
      template: <Message text={this.text} numberOfClicks={this.numberOfClicks} />,
      insert,
    });
  }

  @onEvent({ type: 'click', target: '[data-add]' })
  updateNumberOfClicks() {
    this.numberOfClicks++;
  }

  @onEvent({ type: 'click', target: '[data-reset]' })
  resetElement() {
    if (this.numberOfClicks === 1) return;
    this.messageList.innerHTML = '';
    this.numberOfClicks = 1;
  }

  @onUpdated('numberOfClicks')
  addMessage() {
    this.renderMessage();
    this.messageList.scrollTop = this.messageList.scrollHeight;
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lite-renderer': HtmlTag & LiteRendererProps;
    }
  }
}
