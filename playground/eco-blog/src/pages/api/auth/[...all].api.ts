import { defineGet, definePost } from '@ecopages/core';
import { auth } from '@/lib/auth.server';

export const GET = defineGet({ handler: ({ request }) => auth.handler(request) });

export const POST = definePost({ handler: ({ request }) => auth.handler(request) });
