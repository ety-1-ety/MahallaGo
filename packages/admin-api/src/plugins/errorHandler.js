import fp from 'fastify-plugin';
import { DomainError } from '@mahallashop/shared';

/**
 * Универсальный error handler для Fastify.
 * DomainError → 400 + { code, detail }
 * Прочее → 500 + 'INTERNAL_ERROR' (детали только в логах).
 */
export default fp(async (app) => {
  app.setErrorHandler((err, request, reply) => {
    if (err.validation) {
      return reply.code(400).send({ error: 'VALIDATION', detail: err.message });
    }

    if (err instanceof DomainError) {
      request.log.warn({ code: err.code, detail: err.detail }, 'domain error');
      return reply.code(400).send({ error: err.code, detail: err.detail });
    }

    request.log.error({ err: err.stack || err.message }, 'unhandled error');
    return reply.code(err.statusCode || 500).send({
      error: 'INTERNAL_ERROR',
      // НЕ показываем стек или message клиенту в production
      ...(process.env.NODE_ENV !== 'production' ? { detail: err.message } : {}),
    });
  });
});
