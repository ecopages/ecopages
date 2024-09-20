import { RadiantElement } from '@ecopages/radiant/core';
import { customElement } from '@ecopages/radiant/decorators/custom-element';

@customElement('radiant-navigation')
export class RadiantCounter extends RadiantElement {
  override connectedCallback(): void {
    super.connectedCallback();
    this.toggleNavigation = this.toggleNavigation.bind(this);
    this.closeNavigation = this.closeNavigation.bind(this);
    window.addEventListener('toggle-menu', this.toggleNavigation);
    window.addEventListener('close-menu', this.closeNavigation);
  }

  toggleNavigation(): void {
    this.classList.toggle('hidden');
  }

  closeNavigation(): void {
    this.classList.add('hidden');
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('toggle-menu', this.toggleNavigation);
    window.removeEventListener('close-menu', this.closeNavigation);
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'radiant-navigation': HtmlTag;
    }
  }
}
