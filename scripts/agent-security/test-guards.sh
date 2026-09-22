#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Smoke test for the three self-contained guards in .claude/hooks/. No side
# effects: it only feeds fabricated PreToolUse / UserPromptSubmit payloads to
# the hooks and checks the decision they emit.
#
#   bash scripts/agent-security/test-guards.sh   # expects "pass=N fail=0"
#
# The policy adapters are covered separately by test-hooks.sh / test-policy.sh.
# ---------------------------------------------------------------------------
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
HOOKS="$ROOT/.claude/hooks"
export CLAUDE_PROJECT_DIR="$ROOT"
SLUG="${ROOT//\//-}" # how Claude Code names this project's own state directory
DOT='.env'           # kept in a variable so this file has no bare .env token
E=guard-env-file.sh
S=guard-project-scope.sh
P=guard-prompt-scope.sh
PASS=0
FAIL=0

run() { # <hook> <expect: deny|allow> <label> <payload>
  local hook="$1" expect="$2" label="$3" payload="$4" out got
  out="$(printf '%s' "$payload" | "$HOOKS/$hook" 2>&1)"
  if printf '%s' "$out" | grep -q '"permissionDecision":"deny"'; then got=deny; else got=allow; fi
  if [ "$got" = "$expect" ]; then
    PASS=$((PASS + 1))
    printf 'ok   %-5s %s\n' "$got" "$label"
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL want=%s got=%s %s\n     %s\n' "$expect" "$got" "$label" "$out"
  fi
}

bash_payload() { printf '{"tool_name":"Bash","cwd":"%s","tool_input":{"command":"%s"}}' "$ROOT" "$1"; }
file_payload() { printf '{"tool_name":"%s","cwd":"%s","tool_input":{"file_path":"%s"}}' "$1" "$ROOT" "$2"; }

# UserPromptSubmit has no permissionDecision: exit 2 is the block, and the
# reason goes to stderr. Same contract, different wire format.
prompt_payload() { printf '{"hook_event_name":"UserPromptSubmit","cwd":"%s","prompt":"%s"}' "$ROOT" "$1"; }

run_prompt() { # <expect: block|allow> <label> <prompt text>
  local expect="$1" label="$2" out code got
  out="$(prompt_payload "$3" | "$HOOKS/$P" 2>&1)"
  code=$?
  if [ "$code" -eq 2 ]; then got=block; else got=allow; fi
  if [ "$got" = "$expect" ]; then
    PASS=$((PASS + 1))
    printf 'ok   %-5s %s\n' "$got" "$label"
  else
    FAIL=$((FAIL + 1))
    printf 'FAIL want=%s got=%s (exit %s) %s\n     %s\n' "$expect" "$got" "$code" "$label" "$out"
  fi
}

echo "--- $E ---"
run $E deny "Read $DOT" "$(file_payload Read "$DOT")"
run $E deny "Read absolute $DOT" "$(file_payload Read "$ROOT/$DOT")"
run $E deny "Edit $DOT.production" "$(file_payload Edit "$DOT.production")"
run $E deny "Write $DOT.local" "$(file_payload Write "$DOT.local")"
run $E allow "Read $DOT.example" "$(file_payload Read "$DOT.example")"
run $E allow "Read src/config/env.ts" "$(file_payload Read "src/config/env.ts")"
run $E deny "bash cat $DOT" "$(bash_payload "cat $DOT")"
run $E deny "bash rm -f $DOT.local" "$(bash_payload "rm -f $DOT.local")"
run $E deny "bash cp $DOT elsewhere" "$(bash_payload "cp $DOT /tmp/x")"
run $E deny "bash source $DOT" "$(bash_payload "source $DOT")"
run $E deny "bash append to $DOT" "$(bash_payload "echo X >> $DOT")"
run $E deny "bash cat $DOT* (glob)" "$(bash_payload "cat $DOT*")"
run $E deny "bash --env-file $DOT" "$(bash_payload "docker compose --env-file $DOT up")"
run $E deny "bash sed -i on $DOT" "$(bash_payload "sed -i s/A/B/ $DOT")"
run $E allow "bash cat $DOT.example" "$(bash_payload "cat $DOT.example")"
run $E allow "bash pnpm test 2>/dev/null" "$(bash_payload "pnpm test 2>/dev/null")"
run $E allow "bash grep process.env src" "$(bash_payload "grep -r process.env src")"
run $E deny "grep with $DOT as target" "$(printf '{"tool_name":"Grep","cwd":"%s","tool_input":{"pattern":"SECRET","path":"%s"}}' "$ROOT" "$DOT")"
run $E deny "glob **/$DOT*" "$(printf '{"tool_name":"Glob","cwd":"%s","tool_input":{"pattern":"**/%s*"}}' "$ROOT" "$DOT")"
run $E allow "write a doc that mentions $DOT" "$(printf '{"tool_name":"Write","cwd":"%s","tool_input":{"file_path":"README.md","content":"copy %s.example to %s"}}' "$ROOT" "$DOT" "$DOT")"
run $E deny "mcp tool targeting $DOT" "$(printf '{"tool_name":"mcp__fs__read","cwd":"%s","tool_input":{"path":"%s"}}' "$ROOT" "$DOT")"
run $E deny "mcp shell cat $DOT" "$(printf '{"tool_name":"mcp__sh__run","cwd":"%s","tool_input":{"command":"cat %s"}}' "$ROOT" "$DOT")"

echo "--- $S ---"
run $S allow "Read src/app.ts" "$(file_payload Read "src/app.ts")"
run $S allow "Read absolute inside the project" "$(file_payload Read "$ROOT/src/app.ts")"
run $S allow "Read src/../src/app.ts" "$(file_payload Read "src/../src/app.ts")"
run $S deny "Read ../../other-project/x.ts" "$(file_payload Read "../../other-project/x.ts")"
run $S deny "Read /etc/passwd" "$(file_payload Read "/etc/passwd")"
run $S deny "Write ~/notes.md" "$(file_payload Write "~/notes.md")"
run $S allow "Write this project's own agent state" "$(file_payload Write "${HOME:-/root}/.claude/projects/$SLUG/memory/x.md")"
run $S deny "Write another project's agent state" "$(file_payload Write "${HOME:-/root}/.claude/projects/-home-other/memory/x.md")"
run $S allow "Write the agent scratchpad" "$(file_payload Write "/tmp/claude-$(id -u)/abc/scratchpad/x.txt")"
run $S deny "bash cat ../../other-project/file" "$(bash_payload "cat ../../other-project/file.ts")"
run $S deny "bash cd .." "$(bash_payload "cd ..; ls")"
run $S deny "bash cd ~" "$(bash_payload "cd ~")"
run $S deny "bash git -C /srv/repo" "$(bash_payload "git -C /srv/repo status")"
run $S deny "bash cp out of the tree" "$(bash_payload "cp src/app.ts ../outside/app.ts")"
run $S deny "bash --outDir=../../x" "$(bash_payload "tsc --outDir=../../x")"
run $S allow "bash git diff HEAD~1..HEAD" "$(bash_payload "git diff HEAD~1..HEAD")"
run $S allow "bash git log main..develop" "$(bash_payload "git log --oneline main..develop")"
run $S allow "bash pnpm test 2>/dev/null" "$(bash_payload "pnpm test 2>/dev/null")"
run $S allow "bash find . -name *.ts" "$(bash_payload "find . -name *.ts -not -path ./node_modules/*")"
run $S allow "bash ls /usr/bin" "$(bash_payload "ls /usr/bin")"
run $S allow "bash node_modules/.bin/tsc" "$(bash_payload "node_modules/.bin/tsc --noEmit")"
run $S allow "bash curl https url" "$(bash_payload "curl -s https://example.com/a/b")"
run $S allow "Glob **/*.ts" "$(printf '{"tool_name":"Glob","cwd":"%s","tool_input":{"pattern":"**/*.ts"}}' "$ROOT")"
run $S deny "Glob ../../**/*.ts" "$(printf '{"tool_name":"Glob","cwd":"%s","tool_input":{"pattern":"../../**/*.ts"}}' "$ROOT")"
run $S allow "Grep regex containing ../" "$(printf '{"tool_name":"Grep","cwd":"%s","tool_input":{"pattern":"\\\\.\\\\./","path":"src"}}' "$ROOT")"
run $S allow "Write a doc that mentions ../" "$(printf '{"tool_name":"Write","cwd":"%s","tool_input":{"file_path":"docs/x.md","content":"use ../../foo in examples"}}' "$ROOT")"
run $S deny "mcp tool escaping the project" "$(printf '{"tool_name":"mcp__fs__read","cwd":"%s","tool_input":{"path":"../../secrets/x"}}' "$ROOT")"
run $S deny "malformed payload fails closed" '{"tool_name":"Bash","tool_input":{"command":"cd \& ls"'

echo "--- $P ---"
run_prompt allow "no @ reference at all" "o hook nao funcionou, investiga"
run_prompt allow "@ reference inside the project" "explica o @src/app.ts"
run_prompt allow "@ reference to a hook" "o hook @.claude/hooks/guard-project-scope.sh falhou"
run_prompt allow "@ reference normalising back inside" "veja @src/../src/app.ts"
run_prompt allow "@ reference to this project own state" "veja @${HOME:-/root}/.claude/projects/$SLUG/memory/x.md"
run_prompt allow "@ reference to the agent scratchpad" "veja @/tmp/claude-$(id -u)/abc/scratchpad/x.txt"
run_prompt allow "an e-mail address is not a reference" "fale com joao@example.com sobre isso"
run_prompt allow "a decorator is not an escape" "@Injectable() no nest"
run_prompt allow "a path in prose is not an attachment" "o padrao ../../outro-projeto aparece no exemplo"
run_prompt block "@../sibling-project/ (the reported bypass)" "eu pedi para ler assim: @../cardosofiles-api/"
run_prompt block "@ reference two levels up" "compara com @../../outro-projeto/src/x.ts"
run_prompt block "@ absolute path elsewhere" "veja @/etc/passwd"
run_prompt block "@ home-relative path" "veja @~/.ssh/id_rsa"
run_prompt block "@ another project agent state" "veja @${HOME:-/root}/.claude/projects/-home-other/memory/x.md"
run_prompt block "@ reference glued to markdown punctuation" "veja isso (@../outro-projeto/README.md) agora"
run_prompt block "@ reference with trailing comma" "veja @../outro-projeto/README.md, por favor"
run_prompt block "@ reference mid-sentence, quoted" "abre o @../outro-projeto/package.json e resume"

echo
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
