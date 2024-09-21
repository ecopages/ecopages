import { RadiantElement } from '@ecopages/radiant/core';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';

@customElement('radiant-navigation')
export class RadiantCounter extends RadiantElement {
  @onEvent({ window: true, type: 'toggle-menu' })
  toggleNavigation(): void {
    this.classList.toggle('hidden');
  }

  @onEvent({ window: true, type: 'close-menu' })
  closeNavigation(): void {
    this.classList.add('hidden');
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'radiant-navigation': HtmlTag;
    }
  }
}
