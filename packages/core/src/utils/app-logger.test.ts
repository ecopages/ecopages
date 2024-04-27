import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Logger } from './app-logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('Test');
  });

  it('should log info message', () => {
    const consoleSpy = spyOn(console, 'log');
    logger.info('Info message');
    expect(consoleSpy).toHaveBeenCalledWith('\x1b[32mTest', 'Info message', '\x1b[0m');
    consoleSpy.mockRestore();
  });

  it('should log warning message', () => {
    const consoleSpy = spyOn(console, 'log');
    logger.warn('Warning message');
    expect(consoleSpy).toHaveBeenCalledWith('\x1b[33mTest', 'Warning message', '\x1b[0m');
    consoleSpy.mockRestore();
  });

  it('should log error message', () => {
    const consoleSpy = spyOn(console, 'log');
    logger.error('Error message');
    expect(consoleSpy).toHaveBeenCalledWith('\x1b[31mTest', 'Error message', '\x1b[0m');
    consoleSpy.mockRestore();
  });

  it('should log debug message when debugActive is true', () => {
    const consoleSpy = spyOn(console, 'log');
    import.meta.env.DEBUG_ACTIVE = 'true';
    logger.debug('Debug message');
    expect(consoleSpy).toHaveBeenCalledWith('\x1b[36mTest', 'Debug message', '\x1b[0m');
    consoleSpy.mockRestore();
  });

  it('should not log debug message when debugActive is false', () => {
    const consoleSpy = spyOn(console, 'log');
    import.meta.env.DEBUG_ACTIVE = 'false';
    logger.debug('Debug message');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
