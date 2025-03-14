import type { ClientImageRenderer } from 'src/client/client-image-renderer';

declare global {
  var imageUtils: ClientImageRenderer;
}
