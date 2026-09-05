import 'fastify';
import type { Session, User } from '../../modules/auth/auth.config.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    session: Session | null;
  }

  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply?: FastifyReply) => Promise<void>;
  }
}
