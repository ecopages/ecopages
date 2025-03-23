import images from 'ecopages:images';
import { html } from '@ecopages/core/html';
import { EcoImage } from '@ecopages/image-processor/component/html';
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
      'theodore-poncet-QZePhoGqD7w-unsplash.jpg',
      'ezi-76GU53nkLSU-unsplash.jpg',
      'urban-vintage-78A265wPiO4-unsplash.jpg',
    ];

    const src = srcs[Math.floor(Math.random() * srcs.length)];

    this.renderTemplate({
      target: this.container,
      template: html`
				!${EcoImage({
          ...images[src],
          alt: 'Random image',
          layout: 'full-width',
          height: 200,
          priority: true,
        })}
				!${EcoImage({
          ...images[src],
          alt: 'Random image',
          width: 600,
          height: 200,
          layout: 'constrained',
          priority: false,
        })}
				!${EcoImage({
          ...images[src],
          alt: 'Random image',
          layout: 'fixed',
          width: 200,
          height: 200,
          priority: false,
        })}
				!${EcoImage({
          ...images[src],
          width: 400,
          alt: 'Random image',
          priority: false,
          unstyled: true,
          'data-test': 'attribute',
        })}
				!${EcoImage({
          ...images[src],
          alt: 'Random image',
          priority: false,
          width: 300,
          aspectRatio: '1/2',
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
