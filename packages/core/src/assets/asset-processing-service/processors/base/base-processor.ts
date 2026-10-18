import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../../../constants.ts';
import type { EcoPagesAppConfig } from '../../../../config/internal-types.ts';
import { contentHash } from '../../../../utils/content-hash.ts';
import { isDevelopmentRuntime, isProductionRuntime } from '../../../../utils/runtime.ts';
import type { BaseAsset, ProcessedAsset } from '../../assets.types.ts';

export abstract class BaseProcessor<T extends BaseAsset> {
	protected appConfig: EcoPagesAppConfig;

	constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
		this.appConfig = appConfig;
	}

	get isDevelopment(): boolean {
		return isDevelopmentRuntime();
	}

	get isProduction(): boolean {
		return isProductionRuntime();
	}

	abstract process(dep: T): Promise<ProcessedAsset>;

	protected getAssetsDir(): string {
		return path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR);
	}

	protected generateHash(content: string): string {
		return BigInt(`0x${contentHash(content, 16)}`).toString(10);
	}
}
