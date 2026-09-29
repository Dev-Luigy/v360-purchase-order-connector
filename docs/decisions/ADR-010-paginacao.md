# ADR-010 — Paginação por cursor

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Claude; tarefa P1-01.
- Autoridade: decisão de engenharia da tarefa; o enunciado exige paginação em toda lista e cobra a defesa da estratégia.

## Decisão

**Cursor sobre a identidade interna imutável**, em ordem crescente. Tamanho padrão 50, teto 100; pedido acima do teto é `400`, não recorte silencioso — o enunciado quer o teto justamente para não descobrir em produção o que acontece quando alguém pede um milhão de registros.

O cursor é **opaco**: base64url de `{ v, after, f }`, onde `f` é a impressão dos filtros. Se a plataforma trocar de filtro no meio da varredura, o cursor não bate e devolvemos `400` em vez de resultado incoerente. Opaco também evita que o cliente construa cursor à mão e passe a depender do nosso identificador interno.

A resposta entrega o que a plataforma precisa para navegar sem adivinhar: `{ data, page: { limit, cursor, nextCursor, hasMore } }`. `hasMore` sai de buscar `limit + 1` linhas e descartar a sobra — sem `COUNT` na tabela inteira, que é caro e desnecessário.

Vale para as duas listas: consulta de pedidos e histórico de conferências. Os filtros do requisito 1 combinam com a paginação por construção, porque a impressão dos filtros viaja no cursor.

## Por que cursor e não deslocamento

O caso de uso descrito é varredura em lote de madrugada sobre dezenas de milhares de pedidos, **enquanto novas cargas entram**. Com `OFFSET`, cada página relê e descarta as anteriores, ficando mais lenta conforme avança, e qualquer inserção no meio desloca as linhas, fazendo a varredura pular ou repetir registros. Cursor sobre chave imutável não sofre nenhum dos dois.

## Limitação assumida, não escondida

Uma varredura por cursor não é um instantâneo. Pedidos inseridos antes da posição atual não aparecem naquela passagem, e uma atualização que muda a participação do registro no filtro — um pedido que zera o saldo no meio da noite — pode fazê-lo aparecer duas vezes ou nenhuma, dependendo de quando mudou. Resolver isso exigiria instantâneo persistido dos resultados ou versionamento consultável.

Não vamos construir isso. O enunciado pede paginação que conviva com filtros, diga onde a plataforma está e se há mais, com a escolha defendida; consistência de leitura sob escrita concorrente não está no escopo, e a passagem seguinte pega o que faltou. Isto **rebaixa deliberadamente** a proposta do [TECHNICAL_PLAN](../TECHNICAL_PLAN.md), item 4, que se comprometia a resolver instantâneo antes de concluir a Parte 1 ([REVIEW-02](../handoffs/REVIEW-02-claude.md)).

## Consumidores e pendências

Contrato em `src/application/ports/pagination.ts`. P1-02 implementa a consulta com índice que sustente `(filtros, id)`; P1-04 traduz cursor e limite na borda HTTP e valida o teto.

Pendência: a ordenação é por `id`, que é ordem de primeira ingestão, não de data do pedido. Se a plataforma pedir varredura por data, entra um cursor composto `(issuedOn, id)` e um índice correspondente.

## Atualização — FIX-15, 2026-09-29

**O cursor passou a carregar o teto da varredura**, e a versão foi para `2`:
`{ v, after, until, f }`.

Com apenas o limite inferior, uma varredura sob escrita contínua persegue o que
entra e **não tem condição própria de término** — e é exatamente esse o cenário
do requisito 1, varrer de madrugada enquanto novas cargas chegam
([REVIEW-14](../handoffs/REVIEW-14-pos-fix-14-final-01-codex.md), R14-02). O
`scripts/validate-sweep-under-load.mjs` não mostrava isso porque o escritor dele
é finito: a varredura terminava quando o produtor acabava, não por decisão
própria.

O teto é o maior identificador que satisfaz os filtros **no momento da primeira
página**, e viaja no cursor a partir dali. Consequências assumidas:

- a varredura é um **retrato**: o que entra depois fica para a próxima, que é o
  comportamento que a plataforma já espera de uma varredura noturna;
- a primeira página custa uma consulta a mais, para descobrir o teto;
- cursor da versão 1 é **recusado**, não reinterpretado — é para isso que o
  campo de versão existe desde o começo.
