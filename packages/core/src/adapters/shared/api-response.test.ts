import { beforeEach, describe, expect, it } from 'bun:test';
import { ApiResponseBuilder } from './api-response';

describe('ApiResponseBuilder', () => {
  let builder: ApiResponseBuilder;

  beforeEach(() => {
    builder = new ApiResponseBuilder();
  });

  describe('json()', () => {
    it('should create JSON response with correct content type and data', async () => {
      const data = { foo: 'bar' };
      const response = builder.json(data);

      expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(await response.json()).toEqual(data);
      expect(response.status).toBe(200);
    });
  });

  describe('text()', () => {
    it('should create text response with correct content type and data', async () => {
      const text = 'Hello World';
      const response = builder.text(text);

      expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
      expect(await response.text()).toBe(text);
      expect(response.status).toBe(200);
    });
  });

  describe('html()', () => {
    it('should create HTML response with correct content type and data', async () => {
      const html = '<h1>Hello</h1>';
      const response = builder.html(html);

      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      expect(await response.text()).toBe(html);
      expect(response.status).toBe(200);
    });
  });

  describe('status()', () => {
    it('should set custom status code', () => {
      const response = builder.status(404).json({ message: 'Not Found' });
      expect(response.status).toBe(404);
    });
  });

  describe('headers()', () => {
    it('should set custom headers', () => {
      const response = builder.headers({ 'X-Custom': 'Value' }).json({});
      expect(response.headers.get('X-Custom')).toBe('Value');
    });
  });

  describe('redirect()', () => {
    it('should create redirect response with location header', () => {
      const url = 'https://example.com';
      const response = builder.redirect(url);

      expect(response.headers.get('Location')).toBe(url);
      expect(response.status).toBe(302);
    });

    it('should use explicit status for redirect', () => {
      const response = builder.redirect('https://example.com', 301);
      expect(response.status).toBe(301);
    });
  });

  describe('error()', () => {
    it('should create JSON error response for object data', async () => {
      const error = { code: 'ERR_1', message: 'Error occurred' };
      const response = builder.error(error);

      expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(await response.json()).toEqual({ error });
      expect(response.status).toBe(500);
    });

    it('should create text error response for string data', async () => {
      const error = 'Error occurred';
      const response = builder.error(error);

      expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
      expect(await response.text()).toBe(error);
      expect(response.status).toBe(500);
    });

    it('should use explicit status for error', () => {
      const response = builder.error('Not Found', 404);
      expect(response.status).toBe(404);
    });
  });
});
