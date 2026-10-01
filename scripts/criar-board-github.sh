#!/usr/bin/env bash
#
# Cria o board do GitHub Projects e uma issue por tarefa de docs/TASKS.md.
#
# As datas NÃO são inventadas: cada issue traz o período real em que a tarefa
# apareceu no histórico do Git, derivado na hora em que este script roda, mais
# o número de commits e o link para o handoff correspondente. O corpo de cada
# issue aponta para o arquivo do projeto que tem o registro completo.
#
# Rodar uma vez:
#   gh auth login            # ou: export GH_TOKEN=<token com escopo project>
#   bash scripts/criar-board-github.sh
#
# É um utilitário de uso único. Pode apagar depois de rodar.

set -euo pipefail

DONO="${DONO:-Dev-Luigy}"
REPO="${REPO:-Dev-Luigy/v360-purchase-order-connector}"
TITULO="${TITULO:-V360 — Conector de Pedidos de Compra}"
QUADRO='docs/TASKS.md'

command -v gh >/dev/null || { echo 'gh não encontrado'; exit 1; }
command -v python3 >/dev/null || { echo 'python3 não encontrado'; exit 1; }
[ -f "$QUADRO" ] || { echo "rode a partir da raiz do repositório ($QUADRO não encontrado)"; exit 1; }

echo '==> conferindo autenticação e escopo'
gh auth status >/dev/null 2>&1 || { echo 'faça `gh auth login` ou exporte GH_TOKEN'; exit 1; }

echo "==> criando o projeto: $TITULO"
PROJETO=$(gh project create --owner "$DONO" --title "$TITULO" --format json 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin)["number"])') || {
  echo
  echo 'Falhou ao criar o projeto. A causa quase sempre é escopo do token:'
  echo '  - token clássico: precisa do escopo `project`'
  echo '  - token fine-grained: precisa de "Projects: Read and write" na conta'
  echo '  - `gh auth login` interativo pede o escopo sozinho'
  exit 1
}
echo "    projeto #$PROJETO criado"

echo '==> lendo as tarefas do quadro e as datas do histórico'
python3 - "$PROJETO" "$DONO" "$REPO" <<'PY'
import json, re, subprocess, sys, pathlib

projeto, dono, repo = sys.argv[1], sys.argv[2], sys.argv[3]

def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True).stdout.strip()

linhas = pathlib.Path('docs/TASKS.md').read_text(encoding='utf-8').split('\n')
padrao = re.compile(
    r'^\|\s*([A-Z][A-Z0-9]*-[0-9]+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$')

tarefas = []
for linha in linhas:
    achado = padrao.match(linha)
    if not achado:
        continue
    tid, titulo, estado, dono_tarefa, nota = achado.groups()
    datas = [d for d in git('log', '--reverse', '--format=%aI', '--grep', tid, '-i').split('\n') if d]
    handoffs = sorted(pathlib.Path('docs/handoffs').glob(f'{tid}-*.md'))
    tarefas.append({
        'id': tid, 'titulo': titulo, 'estado': estado, 'dono': dono_tarefa, 'nota': nota,
        'inicio': datas[0][:10] if datas else None,
        'fim': datas[-1][:10] if datas else None,
        'commits': len(datas),
        'handoff': f'docs/handoffs/{handoffs[0].name}' if handoffs else None,
    })

print(f'    {len(tarefas)} tarefas lidas')
base = f'https://github.com/{repo}/blob/main'

for i, t in enumerate(tarefas, 1):
    periodo = (f"{t['inicio']} a {t['fim']}" if t['inicio'] and t['fim'] and t['inicio'] != t['fim']
               else (t['inicio'] or 'sem commit associado'))
    corpo = [
        f"**Período real:** {periodo}",
        f"**Commits no histórico:** {t['commits']}",
        f"**Responsável:** {t['dono']}",
        f"**Estado ao fim da entrega:** {t['estado']}",
        '',
        t['nota'],
        '',
        '---',
        '',
        '> Esta issue é um espelho do quadro versionado no próprio repositório.',
        '> O registro completo — escopo, arquivos reservados, critério de aceite e',
        f'> evidência — está em [`docs/TASKS.md`]({base}/docs/TASKS.md), sob a seção `{t["id"]}`.',
    ]
    if t['handoff']:
        corpo += ['>',
                  f'> O que foi feito e como foi verificado: [`{t["handoff"]}`]({base}/{t["handoff"]}).']
    corpo += ['',
              '_As datas vêm do histórico do Git, não da criação desta issue: as issues foram',
              'espelhadas no GitHub ao final do desafio, a partir do quadro que foi mantido',
              'durante o desenvolvimento._']

    url = subprocess.run(
        ['gh', 'issue', 'create', '--repo', repo,
         '--title', f"{t['id']} — {t['titulo']}",
         '--body', '\n'.join(corpo)],
        capture_output=True, text=True, check=True).stdout.strip()

    subprocess.run(['gh', 'project', 'item-add', projeto, '--owner', dono, '--url', url],
                   capture_output=True, text=True)

    if t['estado'].startswith('concluída'):
        subprocess.run(['gh', 'issue', 'close', url, '--repo', repo,
                        '--comment', 'Concluída durante o desenvolvimento; ver evidência no handoff.'],
                       capture_output=True, text=True)

    print(f"    [{i:>2}/{len(tarefas)}] {t['id']:<16} {t['estado']:<22} {url.rsplit('/', 1)[-1]}")
PY

echo
echo "==> pronto: https://github.com/users/$DONO/projects/$PROJETO"
echo '    As issues concluídas ficam fechadas; as abertas aparecem no topo do board.'
