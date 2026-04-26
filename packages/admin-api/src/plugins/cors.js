import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export default fp(async (app) => {
  const origin = process.env.CORS_ORIGIN || 'http://localhost:4200';
  await app.register(cors, {
    origin: origin.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
});
