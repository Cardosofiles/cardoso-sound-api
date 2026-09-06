function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function verificationEmail(input: { name: string; url: string }): {
  subject: string;
  html: string;
} {
  const safeName = escapeHtml(input.name.trim() || 'Usuário');
  const safeUrl = input.url;

  return {
    subject: 'Verifique seu e-mail no Cardoso Sound',
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Verificação de E-mail</title>
</head>
<body style="font-family: sans-serif; line-height: 1.5; color: #333;">
  <h2>Olá, ${safeName}!</h2>
  <p>Obrigado por se cadastrar no Cardoso Sound. Para ativar sua conta, clique no botão abaixo:</p>
  <p style="margin: 24px 0;">
    <a href="${safeUrl}" style="background-color: #1db954; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Verificar E-mail</a>
  </p>
  <p>Se você não criou esta conta, nenhuma ação é necessária.</p>
</body>
</html>
`.trim(),
  };
}

export function resetPasswordEmail(input: { name: string; url: string }): {
  subject: string;
  html: string;
} {
  const safeName = escapeHtml(input.name.trim() || 'Usuário');
  const safeUrl = input.url;

  return {
    subject: 'Redefinição de senha no Cardoso Sound',
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Redefinição de Senha</title>
</head>
<body style="font-family: sans-serif; line-height: 1.5; color: #333;">
  <h2>Olá, ${safeName}!</h2>
  <p>Recebemos uma solicitação para redefinir a senha da sua conta no Cardoso Sound.</p>
  <p style="margin: 24px 0;">
    <a href="${safeUrl}" style="background-color: #1db954; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Redefinir Senha</a>
  </p>
  <p>Este link é válido por 1 hora. Se você não solicitou esta redefinição, desconsidere esta mensagem.</p>
</body>
</html>
`.trim(),
  };
}
