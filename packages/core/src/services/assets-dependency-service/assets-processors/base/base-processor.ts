import path from 'node:path';
import type { EcoPagesAppConfig } from '../../../../internal-types';
import type { BaseAsset, ProcessedAsset } from '../../assets.types';
import { RESOLVED_ASSETS_DIR } from '../../../../constants';
import { FileUtils } from '../../../../utils/file-utils.module';
import { rapidhash } from '../../../../utils/hash';

export abstract class BaseProcessor<T extends BaseAsset> {
  protected appConfig: EcoPagesAppConfig;
  constructor({ appConfig }: { appConfig: EcoPagesAppConfig }) {
    this.appConfig = appConfig;
  }

  get isDevelopment(): boolean {
    return import.meta.env.NODE_ENV !== 'development';
  }

  get isProduction(): boolean {
    return import.meta.env.NODE_ENV === 'production';
  }

  abstract process(dep: T, key: string, config: EcoPagesAppConfig): Promise<ProcessedAsset>;

  protected getDistDir(): string {
    return path.join(this.appConfig.absolutePaths.distDir, RESOLVED_ASSETS_DIR);
  }

  protected getCleanAssetUrl(pathname: string): string {
    const { srcDir } = this.appConfig;
    const url = pathname.split(srcDir)[1];
    return url.split('.').slice(0, -1).join('.');
  }

  protected getFilepath(filename: string): string {
    const distDir = this.getDistDir();
    const filepath = path.join(distDir, filename);
    return filepath;
  }

  protected generateHash(key: string, content: string): string {
    return rapidhash(`${key}:${content}`).toString();
  }

  protected writeAssetToFile({
    content,
    name,
    ext,
  }: {
    content: string | Buffer;
    name: string;
    ext: 'css' | 'js';
  }): string {
    const filepath = this.getFilepath(`${name}.${ext}`);
    if (!FileUtils.existsSync(filepath)) FileUtils.write(filepath, content);
    return filepath;
  }
}
