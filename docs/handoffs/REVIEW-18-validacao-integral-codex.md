# REVIEW-18 — validação integral pós-FIX-18/CLEAN-02

- Responsável: Codex; 2026-09-29.
- Estado: concluída.
- Escopo: confirmar a correção R17-01, a limpeza de comentários e repetir testes funcionais, de falha, integração PostgreSQL, volume, persistência e Docker.
- Implementação de produção/testes: nenhuma alteração nesta revisão. Evidências e posse em [TASKS.md](../TASKS.md).

## Resultado

FIX-18 está confirmado: uma falha ao fechar pedido acima do teto agregado deixa o relatório consistente e **zero linhas não publicadas** no banco. O pedido anterior não é substituído parcialmente. Os cenários passaram tanto na rota HTTP quanto na integração PostgreSQL.

| Verificação                                              |                                                                                                                               Resultado |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------: |
| `npm run check`                                          |                                                   247 testes; 231 passaram, 16 PostgreSQL foram pulados sem `DATABASE_URL`; zero falhas |
| `npm run coverage`                                       |                                                                                          92,45% linhas; 89,86% branches; 86,73% funções |
| `npm run test:integration` em PostgreSQL descartável     |                                                                                                                                   33/33 |
| `node scripts/validate-case.mjs`                         |                                                                                                                                   30/30 |
| `npm run validate:http`                                  |                                                                                                                                   17/17 |
| `npm run validate:sweep --` cenário de 20 mil            | 20.000 do conjunto inicial vistos; 201 páginas; zero repetidos; 80 pedidos em 7 cargas concorrentes; escrita continuou após a varredura |
| `docker compose config --quiet` / `docker compose build` |                                                                                                                                passaram |

### Limites e volume

A bateria HTTP exercitou simultaneidade com linhas distintas, mesma linha, duplicatas, exatamente 10.000 itens, 10.001 itens, cabeçalho concorrente, payload Alfa truncado e falha no fechamento. A regressão R17-01 retornou uma recusa, `stagedTotal` coerente com a amostra e não deixou staging não publicado.

Em API e PostgreSQL descartáveis, cada formato carregou 20.000 pedidos × 3 itens. Zero rejeições e zero repetidos nas varreduras; memória da API ficou aproximadamente estável em 308–310 MiB.

| Cliente |                  Carga |                    Varredura | 10 últimas / 10 primeiras páginas |
| ------- | ---------------------: | ---------------------------: | --------------------------------: |
| Alfa    | 100,4 s; 199 pedidos/s | 20.000 em 200 páginas; 0,8 s |                             0,61× |
| Beta    |  92,8 s; 215 pedidos/s | 20.000 em 200 páginas; 0,8 s |                             0,52× |
| Gama    |  95,7 s; 209 pedidos/s | 20.000 em 200 páginas; 0,8 s |                             0,46× |
| Delta   |  97,7 s; 205 pedidos/s | 40.081 em 401 páginas; 1,4 s |                             0,54× |

### Banco, isolamento e limpeza

Os 33 testes de integração usam `TRUNCATE`; por isso foram executados num contêiner PostgreSQL separado, com migrações próprias. Após os volumes, havia 100.081 pedidos e 260.083 itens nesse banco temporário. As contagens permaneceram idênticas depois de reiniciar **somente** esse contêiner. O contêiner e seus dados descartáveis foram removidos ao final. A API principal continuou respondendo `/ready` 200.

`validate-case` e `validate:http` foram exercitados contra a API principal ativa; não foi executado `TRUNCATE` nela. A bateria HTTP criou dados Delta sob o prefixo aleatório `F14-030BDC1F-`; a limpeza final removeu exatamente suas 13 linhas de pedido e 401 linhas de staging (itens relacionados são removidos em cascata), e a consulta confirmou zero pedidos restantes com esse prefixo. Como a contagem do banco principal não foi capturada antes dos scripts, não afirmo equivalência exata com o estado inicial. Após a rodada: 41 pedidos, 40.049 itens, 808 linhas de staging, 18 conferências e 15 divergências; `/ready` respondeu 200.

## Pendência de segurança/entrega

`npm audit --omit=dev --audit-level=high` **falhou** com quatro vulnerabilidades altas do grafo associado a `prisma` / `@prisma/config`, incluindo `deepmerge-ts` e `mysql2`. O Dockerfile remove esses pacotes da imagem de runtime e o build passou, mas a política de exceções de auditoria continua sem decisão. CI também continua não implementado. Não alterei dependências, código, Dockerfile ou Compose nesta revisão.

## Reprodutibilidade

- `npm run check`
- `npm run coverage`
- `DATABASE_URL=<PostgreSQL descartável> npm run test:integration`
- `node scripts/validate-case.mjs`
- `npm run validate:http`
- `API_URL=<API descartável> node scripts/validate-sweep-under-load.mjs 20000 8`
- Para cada cliente: `API_URL=<API descartável> npm run validate:volume -- 20000 3 <alfa|beta|gama|delta>`
- `npm audit --omit=dev --audit-level=high`
- `docker compose config --quiet` e `docker compose build`

O estado registrado em `docs/TASKS.md` e os comentários em `src/` foram revisados. O único arquivo alterado fora desta documentação era a exclusão preexistente `scripts/activate-node.sh`; foi preservada.
