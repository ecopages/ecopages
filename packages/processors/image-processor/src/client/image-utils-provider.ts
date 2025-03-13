import { ClientImageProcessor } from './client-image-processor';

export class ImageUtilsProvider {
  private static instance: ClientImageProcessor | null = null;

  static initialize(configId: string): void {
    if (!ImageUtilsProvider.instance) {
      ImageUtilsProvider.instance = new ClientImageProcessor(configId);
    }
  }

  static getInstance(): ClientImageProcessor {
    if (!ImageUtilsProvider.instance) {
      throw new Error('ImageUtilsProvider not initialized');
    }
    return ImageUtilsProvider.instance;
  }
}
