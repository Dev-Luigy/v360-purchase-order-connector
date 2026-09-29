# Handoff: FIX-11 — os sete achados de REVIEW-10

- Agente e data: Claude, 2026-09-29.
- Estado: concluída.
- Objetivo e resultado: os sete achados de [REVIEW-10](REVIEW-10-pos-fix-10-codex.md) estão fechados, cada um com regressão. **Nenhum era falso positivo**, pela segunda revisão seguida. E **R10-01 é regressão que eu introduzi em FIX-10**.

## O que eu verifiquei antes de aceitar

Reproduzi os quatro achados de comportamento com uma sonda contra o banco real, antes de tocar em código:

```
R10-01  ingestionVersion 1 -> 3                       <-- avancou por linha
R10-02  so cabecalhos: ordersAccepted=3 itemsAccepted=3 <-- contou o que nao veio
R10-03  batchSize=2, 5 invalidos: [{rejected:5}]       <-- um lote so
R10-04  DUP conflitante -> {bloqueado, Fornecedor Segundo} recusas=0
```

R10-05 confirmei rodando o validador duas vezes: 27/27 na primeira, 26/27 na segunda. R10-06 e R10-07, conferindo os arquivos.

## R10-01 — a regressão que eu introduzi consertando outra coisa

Em FIX-10 eu dei transação e lock ao item avulso, fechando R09-01 e R09-06. Ao fazer isso criei `applyLooseItem`, **uma chamada por linha**. Cada uma abria transação, lia o pedido inteiro, apagava e recriava os itens e incrementava a versão.

Isso quebrou três coisas de uma vez: contradiz a transação por pedido que o ADR-008 decide, deixa retrato parcial quando a segunda linha falha, e regravar o retrato crescente a cada linha custa O(n²).

Consertar R09-01 olhando só para o item, em vez de para a operação que o item faz parte, é o mesmo erro de escopo que produziu R08-01 em FIX-08. A operação virou `applyLooseItems`, que recebe o **grupo** de um pedido e aplica tudo sob um lock e uma transação; o caso de uso agrupa por `(clientId, externalNumber)` antes de chamar.

## R10-02 — contar o que não veio

`itemsAccepted += saved.items.length` somava também os itens **preservados** de cargas anteriores. Uma carga só de cabeçalhos do Delta relatava três itens aceitos sem ter trazido nenhum.

A correção que o review pediu é a certa: o retorno da operação precisa dizer o que ela aplicou. `replaceSnapshot` passou a devolver `{ order, fromLoad, recovered }` — o que veio na carga, o que foi recuperado da espera, e o pedido salvo. O que só foi preservado não entra em nenhum dos dois.

## R10-03 e R10-04 — o adaptador do Delta

R09-05 ficou **pela metade**: eu escoei o `staged` em lotes e deixei as recusas acumulando até o fim do arquivo. Um arquivo só de registros inválidos crescia sem teto — exatamente a entrada adversarial que o achado original descrevia. Agora as recusas escoam durante a leitura, nos dois laços.

R10-04 é uma inconsistência que eu deveria ter visto ao escrever o Delta: o Gama recusa cabeçalhos repetidos que discordam, e o Delta fazia "último vence" em silêncio. Dois cabeçalhos válidos para `DUP` produziam um pedido bloqueado do segundo fornecedor, sem uma linha de recusa. Agora duplicata idêntica é deduplicada e conflito recusa o pedido, com a mesma comparação `sameHeader` do Gama.

## R10-05 — o artefato de evidência não era repetível

Este é o mais incômodo, porque `validate-case.mjs` é o que eu venho citando como prova de que o desafio está atendido. Ele afirmava contagens globais do banco, então só funcionava sobre estado implícito e limpo — e eu vinha truncando as tabelas antes de cada execução, o que **mascarava o defeito em vez de revelá-lo**.

Agora ele afirma sobre o conjunto que ele mesmo cria: os filtros são verificados por pertinência e ausência de vazamento em vez de contagem, e o resumo de conferências compara contra uma linha de base tirada no início. Verificado rodando três vezes seguidas sem limpar, e logo depois da suíte de integração: 27/27 em todas.

## R10-06 — a terceira vez que os números derivaram

Em FIX-10 eu concentrei as contagens num documento só para elas pararem de divergir. Divergiram de novo. Concentrar não resolve; **digitar** é o problema.

`npm run evidence` passou a medir e gravar a linha de evidência do STATUS a partir da saída real dos comandos. O README aponta para lá. O `27/27` continua escrito porque está atado à lista fixa de exigências do enunciado, não ao código.

## R10-07

JSDoc duplicado que minha própria edição de FIX-10 deixou em `purchase-order-repository.ts`. Removido.

## Evidência

Gerada por `npm run evidence -- --full`, não digitada:

```
npm run check              225 testes, 0 falhas (209 sem banco, 16 pulados)
npm run test:integration    27 testes contra PostgreSQL real
npm run coverage            94,66% linhas, 89,98% branches
scripts/validate-case.mjs   27/27, repetível: 3 execuções seguidas e uma
                            logo após a suíte de integração
```

Os cenários que o review listou como faltando viraram regressão: grupo numa transação e numa versão, falha no meio do grupo desfazendo o grupo inteiro, carga só de cabeçalho relatando zero, recusas em lote, cabeçalhos duplicados idênticos e conflitantes, e duas execuções consecutivas do validador.

## O padrão que estas duas revisões expõem

Cinco dos dezesseis achados de REVIEW-09 e REVIEW-10 são **comentários meus que descrevem a intenção e não o código**, e dois são regressões que eu introduzi consertando outra coisa. A defesa que funcionou foi teste que lê o código-fonte — composição dos pools, doc↔código — e agora evidência gerada em vez de escrita: em todos os casos, tirar de mim a tarefa de manter duas coisas iguais à mão.

## Pendências

- Espera sem expiração nem teto por cliente ([ADR-008](../decisions/ADR-008-ingestao.md)).
- O teste de volume cobre Alfa e Beta; o caminho de muitos itens avulsos para um pedido Delta já existente tem regressão funcional, mas não medição de volume.
- Pipeline de CI e política de exceção da auditoria npm, adiados pelo usuário. A imagem de migração ainda carrega o tooling do Prisma.
- Credenciais DDL e DML compartilhadas fora do ambiente local.
- Posse: reservas de FIX-11 liberadas.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam CLEAN-01 do Codex; `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
