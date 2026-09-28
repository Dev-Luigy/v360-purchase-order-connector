# CLEAN-01 — limpeza de comentários

## Resultado

Os comentários do código estável foram reduzidos sem alteração de comportamento. O diff da tarefa troca explicações longas por notas curtas e termina com 526 linhas a menos.

Foram removidos principalmente:

- histórico de achados `REVIEW-*` e `FIX-*`, que já pertence aos handoffs;
- comentários que repetiam nomes, tipos ou operações evidentes;
- exemplos específicos de Alfa/Beta quando a abstração já os expressa;
- narrativa de implementação e justificativas duplicadas entre porta, domínio e adaptador.

Foram preservados comentários sobre:

- precisão decimal, arredondamento e limites antes da materialização;
- semântica de retrato, especialmente `items: null` versus `items: []`;
- limites de memória e encerramento de streams;
- locks concorrentes, cursores vinculados aos filtros e prontidão de schema;
- decisões de índices e histórico imutável no schema;
- poda de dependências no Docker e envio de diagramas a serviço público.

## Arquivos e convivência com P1-04

A limpeza cobre os arquivos listados em `CLEAN-01` no quadro. Não foram alterados os arquivos reservados ou não commitados da P1-04, incluindo `src/domain/{client,ingestion,limits,schemas}.ts`, `src/main/**`, `src/presentation/**`, `src/application/use-cases/**`, `src/infrastructure/integrations/{adapter-registry,client-profiles,field-parsers}.ts` e `tests/**`.

A remoção já existente de `scripts/activate-node.sh` também foi preservada e não pertence a esta tarefa.

## Verificação

- `git diff --check`: passou.
- Prettier nos arquivos alterados: passou; Dockerfile e Prisma foram validados pelos checks próprios do projeto.
- `npm run check`: passou.
- Resultado da suíte: 139 testes, 139 aprovados.

## Próximo passo

Ao concluir P1-04, aplicar o mesmo critério apenas aos arquivos novos dessa tarefa. Evitar reintroduzir números de reviews e narrativas de correção em comentários; esses detalhes devem continuar nos testes e handoffs.
