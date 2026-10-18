import type { EcoPagesElement } from '../../types/contracts.ts';
import { IntegrationRenderer } from './integration-renderer.ts';

/**
 * Base renderer for integrations whose page output is string HTML markup.
 *
 * @remarks
 * Test string fixtures, KitaJS, and MDX share the same document-shell rendering path. Subclasses
 * only need to set `name` and override hooks for integration-specific behavior.
 */
export abstract class StringMarkupRenderer extends IntegrationRenderer<EcoPagesElement> {}
