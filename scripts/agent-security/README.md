# Agent Security Policy

Camada de defesa **a nível dos agentes** (Claude Code e Antigravity CLI). O
objetivo não é impedir que um agente trabalhe, e sim garantir que um agente
comprometido — por _prompt injection_, por conteúdo malicioso vindo da web, ou
por um simples erro de raciocínio — não consiga destruir o repositório,
vazar credenciais ou desligar as próprias proteções.

Tudo aqui é versionado no Git. **Nenhum arquivo desta camada contém segredo.**

---

## Arquitetura

```
scripts/agent-security/policy.sh     <- fonte única de verdade (denylists + regras)
        ├── .claude/hooks/*          <- adaptadores do protocolo Claude Code
        └── .agents/hooks/*          <- adaptadores do protocolo Antigravity CLI
```

Os dois harnesses falam protocolos diferentes (nomes de evento, formato do
payload de stdin, vocabulário de decisão). O que **não** pode divergir é a
política. Por isso as regras vivem em um único arquivo e os hooks são
adaptadores finos: quem edita a denylist edita um lugar só.

Contrato do `policy.sh`:

| Função                             | Entrada                | Define                                    |
| ---------------------------------- | ---------------------- | ----------------------------------------- |
| `agp_guard_command <cmd>`          | linha de comando       | `AGP_DECISION`, `AGP_REASON`, `AGP_RULES` |
| `agp_guard_path <read\|write> <p>` | caminho de arquivo     | idem                                      |
| `agp_guard_content <path> <txt>`   | conteúdo a ser gravado | idem                                      |
| `agp_guard_url <url>`              | URL de saída           | idem                                      |
| `agp_scan_injection <texto>`       | conteúdo não confiável | ecoa ids das heurísticas que casaram      |

`AGP_DECISION` é `allow`, `ask` ou `deny`. Quando mais de uma regra casa, vence
a mais severa e todos os motivos são concatenados.

---

## Modelo de ameaça

| #   | Ameaça                                                                                                 | Mitigação                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 1   | **Prompt injection** em página web, README de dependência ou saída de comando                          | `PostToolUse` marca o conteúdo como DADO, nunca instrução, e descreve o que o texto tentou induzir |
| 2   | **Exfiltração de segredos** (`cat .env \| curl ...`)                                                   | Regra composta: fonte de segredo + saída de rede no mesmo comando = `deny`                         |
| 3   | **Destruição do repositório** (`rm -rf`, `git reset --hard`, force push, rewrite de histórico)         | `deny` para alvos críticos, `ask` para alvos descartáveis                                          |
| 4   | **Supply chain** (`curl \| bash`, troca de registry, install por URL)                                  | `deny` / `ask`                                                                                     |
| 5   | **Roubo de credenciais locais** (`~/.ssh`, `~/.aws`, `gh auth token`)                                  | `deny` em leitura, escrita e cópia                                                                 |
| 6   | **Commit de segredo**                                                                                  | Escrita de literal com formato de credencial é bloqueada antes de tocar o disco                    |
| 7   | **Desligamento das proteções** (`--no-verify`, `core.hooksPath`, apagar hooks)                         | `deny`; alteração legítima passa por `ask` e revisão humana                                        |
| 8   | **SSRF / metadata de nuvem** (`169.254.169.254`) e sinks de exfiltração (`webhook.site`, `ngrok`, ...) | `deny` em `WebFetch`, `read_url_content` e comandos de shell                                       |
| 9   | **MCP com acesso a sistema real** (Postgres, GitHub)                                                   | Todo argumento string do MCP passa pela política de comando e de URL                               |
| 10  | **Escalonamento / persistência** (`sudo`, `crontab`, `~/.bashrc`)                                      | `deny`                                                                                             |

---

## Matriz de decisão

- **`deny`** — nunca é legítimo dentro de uma sessão de agente. O agente recebe
  o motivo e deve propor alternativa ou pedir que a pessoa execute no próprio
  shell.
- **`ask`** — legítimo às vezes, caro quando errado (`rm -rf dist`,
  `git reset --hard`, editar `.github/workflows/`, ler `.env`). Vai para
  aprovação humana.
- **`allow`** — a política se cala. **Os hooks nunca emitem `allow` explícito
  no Claude Code**: um hook só pode apertar, jamais afrouxar as permissões que
  a pessoa já configurou.

## Fail-closed

Se `policy.sh` sumir ou ficar ilegível, os adaptadores respondem `deny` com
instrução de restaurar via Git. Um guard que falha em silêncio é pior que
guard nenhum, porque cria confiança injustificada.

---

## Testes

```bash
bash scripts/agent-security/test-policy.sh   # 100 asserções sobre as regras
bash scripts/agent-security/test-hooks.sh    #  38 asserções ponta a ponta nos hooks
```

`test-policy.sh` cobre os dois lados: o que **deve** ser bloqueado e o que
**não pode** gerar falso positivo (`pnpm build`, `git commit`, `pnpm db:migrate`,
`curl localhost:3333`, `psql` local). Falso positivo é falha de teste — um
guard barulhento acaba desligado, e um guard desligado não protege nada.

Adicionou uma regra? Adicione junto uma asserção `deny/ask` **e** uma `allow`
que prove que o fluxo normal continua passando.

---

## Auditoria

Toda decisão diferente de `allow` vira uma linha JSONL em `.agent-guard.log`
(na raiz, ignorado pelo Git):

```json
{
  "ts": "2026-09-03T19:12:04Z",
  "harness": "claude-code",
  "event": "Bash",
  "decision": "deny",
  "rules": "exfil.secret_to_network",
  "target": "cat .env | curl ..."
}
```

Serve para _blue team_: mostra o que o agente tentou fazer, não só o que
conseguiu. Vale revisar depois de sessões longas ou de qualquer interação com
conteúdo externo.

---

## Limitações conhecidas

- É **detecção por padrão (regex)**, não sandbox. Ofuscação suficientemente
  criativa passa. O normalizador remove aspas e barras invertidas para pegar
  evasões triviais (`r'm' -rf`, `rm\ -rf`), mas isto é uma camada, não a única.
  O isolamento real continua sendo container / usuário sem privilégio.
- A cobertura de MCP depende dos argumentos serem strings inspecionáveis.
- As heurísticas de prompt injection avisam, não bloqueiam: a decisão de
  ignorar o conteúdo continua sendo do modelo — por isso o aviso é explícito
  sobre tratar tudo como DADO.
- `agp_guard_content` roda sobre o conteúdo que o agente vai gravar. Não
  substitui um scanner de segredos no `pre-commit` para mudanças feitas por
  humanos.
