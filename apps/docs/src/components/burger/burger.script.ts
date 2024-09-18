import { RadiantElement } from '@ecopages/radiant/core';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onEvent } from '@ecopages/radiant/decorators/on-event';
import { query } from '@ecopages/radiant/decorators/query';

@customElement('radiant-burger')
export class RadiantCounter extends RadiantElement {
  @query({ selector: 'button' }) burger!: HTMLButtonElement;

  override connectedCallback(): void {
    super.connectedCallback();
    this.onResizeReset = this.onResizeReset.bind(this);
  }

  @onEvent({ selector: 'button', type: 'click' })
  toggleMenu() {
    this.burger.toggleAttribute('aria-expanded');
    const isExpanded = this.burger.hasAttribute('aria-expanded');
    window.dispatchEvent(new CustomEvent('toggle-menu'));
    document.body.classList.toggle('overflow-hidden', isExpanded);
    if (isExpanded) {
      window.addEventListener('resize', this.onResizeReset, { once: true });
    }
  }

  onResizeReset() {
    this.burger.removeAttribute('aria-expanded');
    document.body.classList.remove('overflow-hidden');
    window.dispatchEvent(new CustomEvent('close-menu'));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.onResizeReset);
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'radiant-burger': HtmlTag;
    }
  }
}
