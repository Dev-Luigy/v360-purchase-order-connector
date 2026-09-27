# ADR-006 — Modelo normalizado, identidade e situação canônica

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Claude; tarefa P1-01.
- Autoridade: decisão de engenharia dentro do escopo da tarefa. O enunciado atribui a modelagem a nós e a inclui na avaliação.

## Contexto

Quatro clientes falam do mesmo conceito e discordam em estrutura, idioma, formato de data e número, máscara de CNPJ e vocabulário de situação ([CASE.md](../CASE.md)). O contrato único precisa absorver isso sem que nenhum campo carregue a marca de um cliente.

## Decisão

**Identidade.** O pedido é identificado por `(clientId, externalNumber)` e o item por `(purchaseOrderId, externalLine)`. O enunciado avisa que o mesmo número existe em clientes diferentes, então o número sozinho não serve. A identidade interna (`id`) é atribuída por nós, imutável, e sobrevive a qualquer reenvio: é ela que as conferências referenciam e é ela que ordena o cursor de paginação (ADR-010).

**Situação canônica com três valores:** `aberto`, `encerrado`, `bloqueado`. A tradução mora no perfil do cliente (`statusVocabulary`), não no domínio: `open`/`closed`/`blocked` no Alfa e no Delta, `EM ABERTO`/`BLOQUEADO` no Beta, `1`/`2`/`3` no Gama. Valor fora do mapa é **rejeitado**, não adivinhado — tratar situação desconhecida como aberta liberaria conferência contra pedido bloqueado.

**Data como data.** `issuedOn` é data de calendário, sem hora e sem fuso. O timestamp Unix do Gama é convertido em UTC: verifiquei que `1786752000` e `1784160000` são múltiplos exatos de 86400, isto é, meia-noite UTC, e interpretá-los em `America/Sao_Paulo` jogaria a data um dia para trás (14/08 em vez de 15/08). Duas amostras são evidência fraca, então o adaptador **exige a invariante**: timestamp que não seja múltiplo de 86400 é rejeitado, o que faz a suposição falhar alto em vez de errar em silêncio.

**Saldo persistido.** Cada item guarda `quantityPending` (`ordered - received`) e o pedido guarda `hasPendingBalance`, mantidos na mesma transação da ingestão. O filtro "apenas os que ainda têm algo a receber" é comparação entre duas colunas dentro de um `EXISTS`: o Prisma até expressa isso com field references, mas comparação entre colunas não usa índice B-tree, e essa é a consulta mais quente do requisito 1 sobre dezenas de milhares de pedidos ([REVIEW-02](../handoffs/REVIEW-02-claude.md), item 3).

**Normalização de campos.** CNPJ reduzido a 14 dígitos sem máscara; moeda em ISO 4217 maiúsculo; `externalNumber` preservado como texto, como o cliente escreveu, porque `20260088412` e `DL-2026-0044` convivem.

**Rastro de ingestão.** `ingestionVersion` cresce a cada carga aceita do pedido e `ingestedAt` registra quando. Toda conferência guarda a versão que conferiu (ADR-009).

## Alternativas consideradas

Chave natural como chave primária: descartada, o número repete entre clientes e não dá cursor estável. Situação como texto livre do cliente: descartada, empurraria condicional por cliente para dentro das regras de conferência, contra o `AGENTS.md`. Saldo calculado na consulta: descartada pelo índice.

## Consumidores e pendências

Consome esta decisão: P1-02 (schema, índices, migrações), P1-03 (adaptadores) e P1-04 (API). Contrato em código: `src/domain/primitives.ts`, `client.ts`, `purchase-order.ts`.

Pendência: o termo do Beta para "encerrado" não aparece nas amostras. O perfil do Beta assume `ENCERRADO` e qualquer outro valor cai na regra de rejeição acima. Registrado como suposição em [CASE.md](../CASE.md).
