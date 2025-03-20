import type { ImageProcessorConfig } from '../server/image-processor';
import { IMAGE_PROCESSOR_CONFIG_ID } from '../shared/constants';
import type { ClientImageRendererConfig } from './client-image-renderer';

/**
 * Loads the client configuration from a script element
 * i.e. <script id="eco-config">{ ... }</script>
 */
export class ConfigLoader {
  declare config: {
    optimizedUrlPrefix: string;
    sizes: NonNullable<ImageProcessorConfig['sizes']>;
    format: NonNullable<ImageProcessorConfig['format']>;
    quality?: ImageProcessorConfig['quality'];
  };
  private cachedUrls: Map<string, string> = new Map();

  constructor() {
    this.defaultUrlGenerator = this.defaultUrlGenerator.bind(this);
  }

  /**
   * Default URL generator for the image processor
   * @param path - Original image path
   * @param size - Label size of the image
   * @param format - Image format
   */
  defaultUrlGenerator(path: string, size: string, format: string): string {
    const cacheKey = `${path}-${size}`;

    if (this.cachedUrls.has(cacheKey)) {
      return this.cachedUrls.get(cacheKey) as string;
    }

    const filename = path.split('/').pop() as string;
    const basename = filename.substring(0, filename.lastIndexOf('.'));
    const url = `${this.config.optimizedUrlPrefix}/${basename}-${size}.${format}`;

    this.cachedUrls.set(cacheKey, url);

    return url;
  }

  /**
   * Load the configuration from the script element
   * @returns The client configuration
   * */
  load(): ClientImageRendererConfig {
    const configElement = document.getElementById(IMAGE_PROCESSOR_CONFIG_ID) as {
      textContent: string;
    };

    if (!configElement) {
      throw new Error(`Config element with id "${IMAGE_PROCESSOR_CONFIG_ID}" not found`);
    }

    try {
      this.config = JSON.parse(configElement.textContent);

      if (!Array.isArray(this.config.sizes)) {
        throw new Error('Config must include "sizes" array');
      }

      if (!this.config.format) {
        throw new Error('Config must include "format"');
      }

      return {
        sizes: this.config.sizes,
        format: this.config.format,
        quality: this.config.quality ?? 80,
        generateUrl: this.defaultUrlGenerator,
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid config format: ${error.message}`);
      }

      throw error;
    }
  }
}
