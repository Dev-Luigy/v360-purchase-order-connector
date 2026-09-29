# Handoff: REVIEW-12 — verificação pós-FIX-12

- Agente e data: Codex, 2026-09-29.
- Estado: concluída como revisão; nenhuma correção de produção aplicada.
- Objetivo: conferir os três fechamentos declarados em FIX-12, repetir as sondas e procurar regressões em limites, concorrência, relatórios e evidências.

## Resultado executivo

FIX-12 corrigiu o cenário original de R10-01: cinco linhas do mesmo pedido atravessando três lotes agora são consolidadas em um retrato e uma versão. R10-06 também ficou efetivamente fail-closed. Os dois `continue` de R10-03 foram corrigidos, mas o invariante mais amplo prometido pelo teste — nenhum lote acima de `batchSize` — ainda é falso quando o último lote mistura pedidos e staging.

A separação entre guardar e consolidar é uma direção válida, porém a tabela compartilhada virou acumulador sem identidade da ingestão. Isso criou ou expôs quatro falhas adicionais: o teto de itens por pedido é contornado no caminho item-only do Delta; cargas concorrentes atribuem itens e staging à ingestão errada; o teto de pedidos em espera é conferido depois da escrita; e a amostra do relatório pode ficar vazia com `stagedTotal > 0`.

| Item de REVIEW-11 | Resultado desta verificação                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------- |
| R10-01            | Cenário original fechado; há uma nova falha de atribuição sob concorrência, R12-02.           |
| R10-03            | Parcial: os dois escapes por `continue` fecharam, mas lote misto ainda excede o teto, R12-04. |
| R10-06            | Fechado; sucesso e falha real foram verificados sem publicar evidência falsa.                 |

## Achados

### R12-01 — alta: item-only do Delta contorna `maxItemsPerOrder`

Em `SplitJsonAdapter`, o teto de 10.000 itens só é consultado quando o cabeçalho está em `pendentes`. Se o item não encontrou cabeçalho nesta carga, o ramo de staging apenas valida `normalizedItemSchema` e o escoa. `consolidateStaged` lê todas as linhas, monta um retrato e chama a persistência sem validar o agregado por `normalizedPurchaseOrderSchema`.

Sonda pelo adaptador real:

```text
10.001 itens do mesmo pedido, somente parte items
staged=10001, rejected=0
```

Consequências:

- o limite semântico por pedido não vale para uma forma suportada de carga;
- um pedido existente pode terminar acima do teto;
- `takeWaitingItems`, o mapa de consolidação e `createMany` materializam um grupo sem limite, contrariando a justificativa de memória limitada;
- validar cada item com Zod não valida a cardinalidade do pedido. Este é um ponto em que o schema do agregado também precisa atravessar a fronteira de persistência.

Critério de aceite recomendado: no caminho item-only, exatamente 10.000 linhas são aceitas e 10.001 recusam o pedido inteiro sem alterar o retrato anterior; repetir atravessando vários lotes, espera preexistente e PostgreSQL real.

### R12-02 — alta: duas ingestões concorrentes compartilham e consomem o staging uma da outra

`ingestion_staging` é identificado apenas por cliente, pedido e linha. Não existe `ingestionId`/proprietário da carga; o UUID do relatório só é criado no retorno do caso de uso. Assim, duas cargas item-only do mesmo pedido podem gravar suas linhas antes da consolidação. A primeira que obtém o advisory lock consome as duas cargas; a segunda encontra zero.

Sonda determinística com o repositório Prisma e PostgreSQL real:

```json
{
  "reports": [
    { "itemsAccepted": 2, "stagedTotal": 0 },
    { "itemsAccepted": 0, "stagedTotal": 1 }
  ],
  "stagedRows": 0,
  "savedItems": 2
}
```

O estado final não perde linhas, mas os dois relatórios mentem: uma ingestão toma crédito pelo item da outra e a outra afirma que existe uma linha esperando quando o banco já não tem nenhuma. O teste atual de concorrência verifica somente a união final dos itens e ignora os retornos.

Critério de aceite recomendado: correlacionar as linhas transitórias à ingestão antes de usar a tabela como acumulador, ou adotar outro mecanismo que preserve atribuição por carga. Um teste com dois casos de uso simultâneos deve conferir separadamente os dois relatórios, o staging e o retrato final. Apenas adicionar biblioteca não resolve esta semântica transacional.

### R12-03 — média/alta: `maxStagedOrders` rejeita depois de persistir o lote ofensivo

O caso de uso chama `stageLooseItems` antes de atualizar o mapa e conferir `maxStagedOrders`. Portanto o limite encerra a requisição, mas não impede seu efeito persistente. Com o adaptador real, o excesso pode gravar até um lote inteiro antes do erro; com uma sonda de contrato em um lote:

```text
RangeError depois de stageLooseItems ter recebido 100.001 pedidos
```

A requisição não devolve `IngestionReport`, mas deixa os dados que supostamente excederam o limite na tabela. Calcular os novos números distintos do lote e conferir o total projetado antes de escrever fecha o caso local. A política global de TTL/cota, já reconhecida no ADR-008, continua separada.

### R12-04 — média: R10-03 ainda emite lote misto acima de `batchSize`

O staging residual e `orders + lote` são limitados de forma independente. No `yield` final, os três vetores são combinados sem nova conferência. Os testes adicionados exercitam inválidos, conflitos e overflow isoladamente; não misturam pedidos válidos e órfãos na mesma carga.

Sonda pelo adaptador real:

```text
batchSize=3; 2 pedidos válidos + 2 itens órfãos
tamanhos emitidos=[4]
```

Critério de aceite recomendado: toda emissão precisa afirmar `orders.length + rejected.length + staged.length <= batchSize`, incluindo o último lote e combinações das três categorias.

### R12-05 — média/baixa: amostra de staging pode ficar vazia com total positivo

`amostraDaEspera` guarda os primeiros 100 candidatos antes da consolidação e depois remove os que foram aplicados. Se esses 100 pertencem a pedido existente e o item 101 pertence a pedido ausente, o relatório resulta em:

```text
stagedTotal=1, staged.length=0
```

O contrato descreve `staged` como amostra do que ficou em staging. A lista vazia esconde justamente o único registro ainda pendente. A amostra precisa ser formada depois da decisão, idealmente por consulta limitada ao staging correlacionado à carga.

### R12-06 — baixa: estado documental ainda anuncia “após FIX-11”

`docs/STATUS.md` recebeu os números de FIX-12, mas o cabeçalho continua `Atualizado ... após FIX-11`. É deriva documental, sem efeito de execução.

## O que passou

```text
npm run check                         235 testes, 0 falhas, 16 pulados sem banco
npm run test:integration              27/27 contra PostgreSQL real
npm run coverage                      93,76% linhas; 90,02% branches
node scripts/validate-case.mjs        27/27 exigências
docker compose config --quiet         passou
docker build --check .                passou, sem avisos
```

O `check` também foi executado com stdout capturado por `execFileSync`, exatamente como `evidence.mjs`; as contagens lidas foram 235 testes, 0 falhas e 16 pulados.

Para o caminho de erro de `evidence.mjs`, um `npm` temporário devolveu saída plausível e código 1. O gerador terminou com código 1, escreveu “nada foi escrito” e o SHA-256 de `docs/STATUS.md` permaneceu `4363e62feec08c79cddcf49355b0d7fa48a46887ef4b3574f9e8898e7f33b015`. R10-06 está fechado.

## Cobertura de testes ainda ausente

1. Delta item-only com `maxItemsPerOrder` e `maxItemsPerOrder + 1`, atravessando adaptador, caso de uso e PostgreSQL.
2. Duas execuções simultâneas de `IngestPurchaseOrders` para o mesmo pedido, conferindo cada relatório e não só o estado final.
3. Lote final misturando `orders`, `rejected` e `staged` sob o mesmo teto.
4. Excesso de `maxStagedOrders` provando que nenhuma linha do lote ofensivo foi escrita.
5. Mais de 100 candidatos nos quais os primeiros são consolidados e um posterior continua esperando.
6. Caminho subprocesso do gerador com comando verde, comando vermelho e arquivo intacto; hoje os testes automatizados cobrem só as funções puras. A sonda manual confirmou o vermelho.
7. O teste novo de R10-01 atravessa adaptador e caso de uso, mas usa o repositório em memória. Vale adicionar a mesma regressão ao PostgreSQL para provar a composição completa.

Cobertura percentual alta não substitui esses testes: as falhas estão em interleavings, combinações de buffers e cardinalidade entre lotes, não em linhas completamente não executadas.

## Segurança e operação

- `npm audit --audit-level=low` continua encontrando **4 vulnerabilidades altas** em `deepmerge-ts` e `mysql2`, transitivas do CLI/configuração do Prisma. O Dockerfile remove esses pacotes da imagem de runtime, mas desenvolvimento, migração e CI ainda precisam da política de exceção já adiada. Não executar `npm audit fix --force`: ele propõe downgrade incompatível para Prisma 6.
- Não existe pipeline de CI versionado; portanto `check`, integração, audit e build Docker dependem de execução manual.
- O Compose e a análise estática do Dockerfile passaram. Separação de credenciais DDL/DML e cota/TTL global do staging continuam pendências conhecidas.

## Próxima ordem sugerida

1. Corrigir R12-01 e R12-02 juntos, porque identidade da ingestão, cardinalidade e consolidação concorrem no mesmo contrato de staging.
2. Mover a conferência de R12-03 para antes da escrita e cobrir ausência de efeito colateral.
3. Centralizar a emissão de lotes para fechar R12-04 em todas as combinações.
4. Formar a amostra a partir do estado que realmente continuou esperando, fechando R12-05.
5. Atualizar o cabeçalho do STATUS e manter CI/auditoria como tarefa operacional explícita.

## Arquivos e posse

- Alterados nesta revisão: `docs/TASKS.md` e este handoff.
- Não alterados: código de produção, testes, dependências, lockfile e `docs/STATUS.md`.
- Mudanças preexistentes de CLEAN-01 em `Dockerfile`, `compose.yaml`, `prisma/schema.prisma` e a remoção de `scripts/activate-node.sh` foram preservadas sem edição.
