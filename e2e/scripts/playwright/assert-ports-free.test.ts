import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { assertPortsFree } from './assert-ports-free.mjs';

describe('assertPortsFree', () => {
	let server: net.Server | undefined;

	afterEach(async () => {
		await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
		server = undefined;
	});

	async function listen(): Promise<number> {
		server = net.createServer();
		await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
		return (server.address() as AddressInfo).port;
	}

	it('fails with the port in the message when something listens on it', async () => {
		const port = await listen();

		await expect(assertPortsFree([port])).rejects.toThrow(`Port ${port} is already in use`);
	});

	it('passes once the port is released', async () => {
		const port = await listen();
		await new Promise<void>((resolve) => server?.close(() => resolve()));
		server = undefined;

		await expect(assertPortsFree([port])).resolves.toBeUndefined();
	});
});
