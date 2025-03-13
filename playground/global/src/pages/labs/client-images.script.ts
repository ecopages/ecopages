import { html } from '@ecopages/core/html';
import type { ClientImageProcessor } from '@ecopages/image-processor/client-processor';
import { ImageUtilsProvider } from '@ecopages/image-processor/image-utils-provider';
import { RadiantElement, customElement, onEvent, query } from '@ecopages/radiant';

ImageUtilsProvider.initialize('eco-images-config');

@customElement('eco-images')
export class EcoImages extends RadiantElement {
  private imageUtils: ClientImageProcessor;
  @query({ ref: 'container' }) container!: HTMLElement;

  constructor() {
    super();
    this.imageUtils = ImageUtilsProvider.getInstance();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.createRandomImage();
  }

  @onEvent({ ref: 'create-img', type: 'click' })
  createRandomImage() {
    const srcs = [
      '/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg',
      '/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg',
      '/public/assets/images/urban-vintage-78A265wPiO4-unsplash.jpg',
    ];

    const src = srcs[Math.floor(Math.random() * srcs.length)];

    this.renderTemplate({
      target: this.container,
      template: html`
				!${this.imageUtils.renderImageToString({
          src,
          alt: 'Random image',
          layout: 'full-width',
          height: 200,
          priority: true,
        })}
				!${this.imageUtils.renderImageToString({
          src,
          alt: 'Random image',
          width: 600,
          height: 200,
          layout: 'constrained',
          priority: false,
        })}
				!${this.imageUtils.renderImageToString({
          src,
          alt: 'Random image',
          layout: 'fixed',
          width: 200,
          height: 200,
          priority: false,
        })}
				!${this.imageUtils.renderImageToString({
          src,
          alt: 'Random image',
          priority: false,
          unstyled: true,
          attributes: {
            'data-test': 'attribute',
          },
        })}
			`,
    });
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'eco-images': HtmlTag;
    }
  }
}
