import {
	sourceRelativeStylesheetHref,
	type SourceRelativeStylesheetDirs,
} from '../../../assets/asset-processing-service/processors/stylesheet/source-relative-stylesheet.ts';
import type { ClientBridgeEvent, IClientBridge } from '../../../types/contracts.ts';

/**
 * The events every client bridge sends, over the transport a subclass provides.
 *
 * @remarks
 * An adapter's bridge implements only `broadcast` and `subscriberCount`, so the rules for each event, such as the exact
 * href a `css-update` carries, are the same whatever the transport.
 */
export abstract class ClientBridge implements IClientBridge {
	constructor(private readonly stylesheetDirs: SourceRelativeStylesheetDirs) {}

	abstract broadcast(event: ClientBridgeEvent): void;

	abstract get subscriberCount(): number;

	reload(): void {
		this.broadcast({ type: 'reload' });
	}

	/**
	 * @remarks
	 * Sends the exact href `sourceFile` was delivered at ({@link sourceRelativeStylesheetHref}), so the browser refreshes
	 * that one link. A stylesheet with no such href, such as one outside `srcDir` written under a content hash, sends
	 * nothing.
	 */
	cssUpdate(sourceFile: string): void {
		const href = sourceRelativeStylesheetHref(this.stylesheetDirs, sourceFile);
		if (!href) return;
		this.broadcast({ type: 'css-update', path: href, timestamp: Date.now() });
	}

	update(path: string): void {
		this.broadcast({ type: 'update', path, timestamp: Date.now() });
	}

	error(message: string): void {
		this.broadcast({ type: 'error', message });
	}
}
