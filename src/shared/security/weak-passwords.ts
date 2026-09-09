/**
 * Lista embutida das senhas mais comuns e fracas (NIST SP 800-63B / GAP-25).
 * Todas as entradas devem estar em caixa baixa para comparação case-insensitive sem rede.
 */
const WEAK_PASSWORDS = new Set<string>([
  'password',
  'password1',
  'password123',
  'password1234',
  '12345678',
  '123456789',
  '1234567890',
  '0123456789',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'admin123',
  'administrator',
  'welcome1',
  'welcome123',
  'cardososound',
  'iloveyou',
  'monkey123',
  'dragon123',
  'football',
  'letmein1',
  'master123',
  'sunshine',
  'princess',
  'charlie1',
  'trustno1',
  'abc12345',
  'default1',
  'changeme',
]);

/**
 * Verifica se uma senha candidata é considerada fraca ou comum.
 * A comparação é realizada em minúsculas e sem espaços nas extremidades.
 *
 * @param password A senha em texto plano a ser validada.
 * @returns `true` se a senha constar na lista de senhas fracas; `false` caso contrário.
 */
export function isWeakPassword(password: string): boolean {
  if (!password) {
    return true;
  }
  const normalized = password.toLowerCase().trim();
  return WEAK_PASSWORDS.has(normalized);
}
