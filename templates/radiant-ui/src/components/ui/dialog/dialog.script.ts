/**
 * Browser entry for the `dialog` custom element.
 *
 * Importing the module runs Radiant's `@customElement` registration, and
 * `installDialogs()` adds the document-level listeners that make the
 * `data-dialog-open` / `data-dialog-close` attributes work. Both are
 * idempotent, so loading this from several components on one page is fine.
 *
 * The module in `./index.tsx` loads this file through a lazy trigger, so it is
 * never part of the initial page bundle.
 */
import { installDialogs } from '@ecopages/radiant-ui/dialog';

installDialogs();
