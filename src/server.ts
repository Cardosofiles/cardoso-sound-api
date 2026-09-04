import { buildApp } from './app.js';
import { SHUTDOWN_TIMEOUT_MS } from './config/constants.js';
import { env } from './config/env.js';

let isShuttingDown = false;

async function bootstrap(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    app.log.info({ signal }, `Received ${signal}, starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
      app.log.error(
        `Graceful shutdown timed out after ${String(SHUTDOWN_TIMEOUT_MS)}ms. Forcing process exit.`,
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      await app.close();
      // Em F2-S01 adicionaremos o encerramento do pool Postgres aqui
      app.log.info('Server closed successfully.');
      process.exit(0);
    } catch (error: unknown) {
      app.log.error({ err: error }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  process.on('unhandledRejection', (reason: unknown) => {
    app.log.fatal({ err: reason }, 'Unhandled promise rejection detected');
    process.exit(1);
  });

  process.on('uncaughtException', (error: Error) => {
    app.log.fatal({ err: error }, 'Uncaught exception detected');
    process.exit(1);
  });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server listening on http://${env.HOST}:${String(env.PORT)}`);
  } catch (error: unknown) {
    app.log.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

void bootstrap();
