import type { ClientImageProcessor } from 'src/client/client-image-processor';

declare global {
  var imageUtils: ClientImageProcessor;
}
