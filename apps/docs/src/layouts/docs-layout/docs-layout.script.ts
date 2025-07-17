import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { BurgerEvents } from '@/components/burger/burger.events';

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
