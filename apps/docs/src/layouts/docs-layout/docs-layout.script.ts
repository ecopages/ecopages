import { BurgerEvents } from '@/components/burger/burger.events';
import { onEvent } from '@ecopages/radiant';
import { RadiantElement } from '@ecopages/radiant/core';
import { customElement } from '@ecopages/radiant/decorators/custom-element';

@customElement('radiant-navigation')
export class RadiantCounter extends RadiantElement {
  @onEvent({ window: true, type: BurgerEvents.TOGGLE_MENU })
  toggleNavigation(): void {
    this.classList.toggle('hidden');
  }

  @onEvent({ window: true, type: BurgerEvents.CLOSE_MENU })
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
