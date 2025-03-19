import { afterAll, beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';
import { FileUtils } from '../utils/file-utils.module';
import { CssParserService } from './css-parser.service';

describe('CssParserService', () => {
  let service: CssParserService;
  const mockProcessor = {
    processPath: jest.fn(),
  };
  const mockAppConfig = {
    srcDir: 'src',
    distDir: 'dist',
  };

  beforeEach(() => {
    service = new CssParserService({
      processor: mockProcessor as any,
      appConfig: mockAppConfig as any,
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should create an instance', () => {
    expect(service).toBeInstanceOf(CssParserService);
  });

  describe('buildCssFromPath', () => {
    it('should process a CSS file and write the output', async () => {
      const path = 'src/styles.css';
      const content = '.body { color: red; }';
      mockProcessor.processPath.mockResolvedValue(content);
      spyOn(FileUtils, 'ensureDirectoryExists');
      spyOn(FileUtils, 'writeFileSync');

      await service.buildCssFromPath({ path });

      expect(mockProcessor.processPath).toHaveBeenCalledWith(path);
      expect(FileUtils.ensureDirectoryExists).toHaveBeenCalledWith('dist');
      expect(FileUtils.writeFileSync).toHaveBeenCalledWith('dist/styles.css', content);
    });
  });

  describe('build', () => {
    it('should find CSS files and build them', async () => {
      const cssFiles = ['src/styles.css', 'src/components/button.css'];
      spyOn(FileUtils, 'glob').mockResolvedValue(cssFiles);
      spyOn(service, 'buildCssFromPath');

      await service.build();

      expect(FileUtils.glob).toHaveBeenCalledWith(['src/**/*.css']);
      expect(service.buildCssFromPath).toHaveBeenCalledTimes(2);
      expect(service.buildCssFromPath).toHaveBeenCalledWith({ path: 'src/styles.css' });
      expect(service.buildCssFromPath).toHaveBeenCalledWith({ path: 'src/components/button.css' });
    });

    it('should filter out shadow CSS files', async () => {
      const cssFiles = ['src/styles.css', 'src/components/button.shadow.css'];
      spyOn(FileUtils, 'glob').mockResolvedValue(cssFiles);
      spyOn(service, 'buildCssFromPath');

      await service.build();

      expect(FileUtils.glob).toHaveBeenCalledWith(['src/**/*.css']);
      expect(service.buildCssFromPath).toHaveBeenCalledTimes(1);
      expect(service.buildCssFromPath).toHaveBeenCalledWith({ path: 'src/styles.css' });
    });
  });
});
