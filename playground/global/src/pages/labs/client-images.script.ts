import { html } from '@ecopages/core/html';
import { EcoImage } from '@ecopages/image-processor/image-renderer-provider';
import { RadiantElement, customElement, onEvent, query } from '@ecopages/radiant';

@customElement('eco-images')
export class EcoImages extends RadiantElement {
  @query({ ref: 'container' }) container!: HTMLElement;

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
				!${EcoImage({
          src,
          alt: 'Random image',
          layout: 'full-width',
          height: 200,
          priority: true,
        })}
				!${EcoImage({
          src,
          alt: 'Random image',
          width: 600,
          height: 200,
          layout: 'constrained',
          priority: false,
        })}
				!${EcoImage({
          src,
          alt: 'Random image',
          layout: 'fixed',
          width: 200,
          height: 200,
          priority: false,
        })}
				!${EcoImage({
          src,
          alt: 'Random image',
          priority: false,
          unstyled: true,
          'data-test': 'attribute',
        })}
				!${EcoImage({
          src,
          alt: 'Random image',
          priority: false,
          width: 300,
          aspectRatio: '4/1',
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
