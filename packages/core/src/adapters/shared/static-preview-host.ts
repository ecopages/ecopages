import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

export interface StaticPreviewHost {
	start(options: StaticPreviewHostStartOptions): Promise<number | null>;
	stop(force?: boolean): Promise<void>;
}

export interface StaticPreviewHostStartOptions {
	appConfig: EcoPagesAppConfig;
	hostname: string;
	port: number;
	/**
	 * When true, bind to the next available port if the preferred one is busy.
	 * Should remain false when the port was explicitly configured.
	 */
	allowPortFallback?: boolean;
}
