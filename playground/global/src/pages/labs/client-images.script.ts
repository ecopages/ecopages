import { smallJpg, theodorePoncetQzephogqd7WUnsplashJpg, urbanVintage78A265Wpio4UnsplashJpg } from 'ecopages:images';
import { html } from '@ecopages/core/html';
import { EcoImage } from '@ecopages/image-processor/component/html';
import { customElement, onEvent, query, RadiantElement } from '@ecopages/radiant';

@customElement('eco-images')
export class EcoImages extends RadiantElement {
  @query({ ref: 'container' }) container!: HTMLElement;

  override connectedCallback(): void {
    super.connectedCallback();
    this.createRandomImage();
  }

  @onEvent({ ref: 'create-img', type: 'click' })
  createRandomImage() {
    const availableImages = [urbanVintage78A265Wpio4UnsplashJpg, theodorePoncetQzephogqd7WUnsplashJpg, smallJpg];

    const randomImage = availableImages[Math.floor(Math.random() * availableImages.length)];

    this.renderTemplate({
      target: this.container,
      template: html`
				!${EcoImage({
          ...randomImage,
          alt: 'Random image',
          layout: 'full-width',
          height: 200,
          priority: true,
        })}
				!${EcoImage({
          ...randomImage,
          alt: 'Random image',
          width: 600,
          height: 200,
          layout: 'constrained',
          priority: false,
        })}
				!${EcoImage({
          ...randomImage,
          alt: 'Random image',
          layout: 'fixed',
          width: 200,
          height: 200,
          priority: false,
        })}
				!${EcoImage({
          ...randomImage,
          width: 400,
          alt: 'Random image',
          priority: false,
          unstyled: true,
          'data-test': 'attribute',
        })}
				!${EcoImage({
          ...randomImage,
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
