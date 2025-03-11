import { html } from '@ecopages/core/html';
import { ImagePropsGenerator } from '@ecopages/image-processor/client-processor';
import { RadiantElement, customElement, onEvent, query } from '@ecopages/radiant';

const imageProps = new ImagePropsGenerator('eco-images-config');

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
				!${imageProps.renderImageToString({
          src,
          alt: 'Random image',
          layout: 'full-width',
          height: 200,
          priority: true,
        })}
				!${imageProps.renderImageToString({
          src,
          alt: 'Random image',
          width: 600,
          height: 200,
          layout: 'constrained',
          priority: false,
        })}
				!${imageProps.renderImageToString({
          src,
          alt: 'Random image',
          layout: 'fixed',
          width: 200,
          height: 200,
          priority: false,
        })}
				!${imageProps.renderImageToString({
          src,
          alt: 'Random image',
          width: 400,
          height: 200,
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
