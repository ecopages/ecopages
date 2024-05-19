import type { LiteElement, RenderInsertPosition } from '@/core/lite-element';

type Constructor<T> = new (...args: any[]) => T;

type WithKitaRenderTemplateProps = {
  target: HTMLElement;
  template: JSX.Element | string;
  insert?: RenderInsertPosition;
};

interface WithKitaMixin {
  renderTemplate: (props: WithKitaRenderTemplateProps) => Promise<void>;
}

/**
 * A mixin that provides a method to render a JSX template into an HTMLElement.
 */
export function WithKita<T extends Constructor<LiteElement>>(Base: T): T & Constructor<WithKitaMixin> {
  return class extends Base implements WithKitaMixin {
    override async renderTemplate({ target = this, template, insert = 'replace' }: WithKitaRenderTemplateProps) {
      const safeTemplate = typeof template !== 'string' ? template.toString() : template;
      switch (insert) {
        case 'replace':
          target.innerHTML = safeTemplate;
          break;
        case 'beforeend':
          target.insertAdjacentHTML('beforeend', safeTemplate);
          break;
        case 'afterbegin':
          target.insertAdjacentHTML('afterbegin', safeTemplate);
          break;
      }
    }
  } as T & Constructor<WithKitaMixin>;
}
