import { describe, expect, it } from 'bun:test';
import { FileUtils } from './file-utils.module';

describe('FileUtils', () => {
  it('should be defined', () => {
    expect(FileUtils).toBeDefined();
  });

  describe('glob', () => {
    it('should be defined', () => {
      expect(FileUtils.glob).toBeDefined();
    });
  });

  describe('Should return a list of files', () => {
    it('should return a list of files', async () => {
      const files = await FileUtils.glob(['.'], {
        cwd: __dirname,
      });
      expect(files).toBeDefined();
      expect(files).toBeInstanceOf(Array);
    });
  });
});
