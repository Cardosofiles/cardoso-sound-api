/**
 * As rotas de autenticação do Better Auth (/api/auth/*) são montadas e gerenciadas
 * diretamente pelo auth.plugin.ts através da rota curinga e do adaptador Fetch API.
 *
 * Conforme Decisão D-44 e regras de isolamento de boundaries do eslint-plugin-boundaries,
 * este arquivo preserva a convenção estrutural de módulos sem exportar rotas redundantes.
 */
export {};
