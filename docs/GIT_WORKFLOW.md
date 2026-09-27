# Fluxo de branches

Uma branch por tarefa do quadro. Complementa [COLLABORATION.md](COLLABORATION.md), que define posse e handoff; aqui está só o Git.

## Branches

- `main` é a branch de integração. Só recebe trabalho com `npm run check` verde e handoff atualizado. Os marcos do desafio (`parte-1`) são tags em `main`.
- Toda tarefa vira uma branch `<tipo>/<id>-<slug>`, com o ID do quadro em minúsculas:

```sh
git switch main
git switch -c feat/p1-03-adaptadores-alfa-beta
```

- Tipos: `feat` (funcionalidade), `fix` (correção), `refactor`, `test`, `docs`, `chore` (ambiente, build, dependências).
- **O ID da branch é o ID de [TASKS.md](TASKS.md).** Sem tarefa registrada, não se abre branch. O responsável da tarefa é o único que commita naquela branch.
- Branch de tarefa é curta: nasce de `main` atualizada e volta para `main` ao fim da tarefa. Não acumular tarefas na mesma branch.

### A reserva do quadro vai direto para `main`

Branch por tarefa tem um custo: o que está na branch é invisível para o outro agente até o merge, e o quadro é justamente o mecanismo que evita dois agentes no mesmo arquivo. Então a linha de reserva em [TASKS.md](TASKS.md) — ID, responsável, arquivos reservados — é commitada direto em `main`, antes de abrir a branch. O resto do trabalho da tarefa, incluindo o handoff e a atualização final do quadro, vai na branch e chega por merge.

## Commits

Formato `<tipo>(<id>): resumo no imperativo`, em português, assunto até ~72 caracteres:

```text
feat(p1-03): converter decimal brasileiro e máscara de CNPJ do Beta
docs(doc-01): versionar enunciado e amostras dos clientes
```

Um commit deve deixar a branch coerente: não misturar tarefas, não commitar código gerado nem `.env`. Corpo do commit só quando houver decisão ou limitação que o diff não mostra — o detalhe mora no handoff, não na mensagem.

## Integração

```sh
npm run check                 # na branch da tarefa
git switch main
git merge --no-ff feat/p1-03-adaptadores-alfa-beta
git branch -d feat/p1-03-adaptadores-alfa-beta
```

`--no-ff` mantém a tarefa visível como uma unidade no histórico, que é o que permite responder depois "o que precisou mudar para o cliente novo entrar" — pergunta que o enunciado faz na Parte 2.

Rebase é permitido **apenas** na própria branch, antes do merge (`git rebase main`), para resolver divergência. Nunca reescrever `main`, nunca reescrever a branch de outro agente, nunca reescrever commit já integrado.

Não existe remote hoje, então não existe pull request: o merge é local. Se um remote for adicionado, a mesma branch passa a virar PR e o merge acontece pelo PR, sem mudar a convenção de nomes.

## Tags de marco

```sh
git tag -a parte-1 -m "Parte 1: clientes Alfa e Beta validados"
```

Só depois de P1-05 concluída com evidência. A tag é o que permite a avaliação comparar a Parte 1 com a Parte 2.

## Dois agentes, um diretório

O workspace é compartilhado e o Git não dá bloqueio automático:

- **Uma branch ativa por diretório.** Quem tem tarefa em andamento controla a branch daquele diretório; o outro agente não troca de branch nem faz merge enquanto isso. Trocar branch debaixo do outro agente corrompe o trabalho dele sem aviso.
- Para trabalho realmente simultâneo, worktree por tarefa:

```sh
git worktree add ../v360-p1-03 -b feat/p1-03-adaptadores-alfa-beta
```

Custos reais: cada worktree precisa do seu `npm ci` (o `node_modules` não é compartilhado) e do seu `.env`; e o Compose usa as portas 3000 e 5432, então apenas um worktree pode subir o serviço por vez.

- Nunca: `git reset --hard`, `git clean -fd`, `git restore` em arquivo alheio, `git push --force`, ou commit abrangendo tarefa de outro agente.

## Estado inicial

O repositório começou com um commit base único importando a base existente, autorizado pelo usuário: a maior parte é trabalho do Codex (ENV-01, COL-01, COL-02, ARCH-01 a ARCH-04) e o restante é DOC-01 do Claude. Separar autoria retroativamente exigiria dividir arquivos que os dois editaram, com risco maior que o ganho. A branch principal chama `main`. O fechamento documental de REPO-01 também foi direto em `main`, por ser a tarefa que criou a branch. Dali em diante, toda tarefa passa por branch.
