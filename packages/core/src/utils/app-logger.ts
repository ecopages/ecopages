interface LogLevel {
  level: string;
}

const INFO: LogLevel = { level: 'INFO' };
const ERROR: LogLevel = { level: 'ERROR' };
const DEBUG: LogLevel = { level: 'DEBUG' };
const WARN: LogLevel = { level: 'WARN' };

export class Logger {
  private readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  info(...args: any[]) {
    this.logInternal(INFO, ...args);
  }

  warn(...args: any[]) {
    this.logInternal(WARN, ...args);
  }

  error(...args: any[]) {
    this.logInternal(ERROR, ...args);
  }

  debug(...args: any[]) {
    if (process.env.DEBUG_ACTIVE === 'true') {
      this.logInternal(DEBUG, ...args);
    }
  }

  private logInternal(level?: LogLevel, ...args: any[]) {
    const colorCode = level
      ? {
          INFO: '\x1b[32m', // Green
          ERROR: '\x1b[31m', // Red
          WARN: '\x1b[33m', // Yellow
          DEBUG: '\x1b[36m', // Cyan
        }[level.level]
      : '';

    const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg)).join(' ');

    const logStart = `${colorCode ? colorCode : ''}${this.prefix}`;
    const logEnd = '\x1b[0m';

    console.log(logStart, ...args, logEnd);
  }
}

export const appLogger = new Logger('[eco-pages]');
