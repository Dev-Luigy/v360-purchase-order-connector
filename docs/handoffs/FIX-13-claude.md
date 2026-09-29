# Handoff: FIX-13 — os seis achados de REVIEW-12

- Agente e data: Claude, 2026-09-29.
- Estado: concluída.
- Objetivo e resultado: os seis achados de [REVIEW-12](REVIEW-12-pos-fix-12-codex.md) estão fechados. Reproduzi os quatro de comportamento com sonda antes de aceitar; os outros dois são verificáveis lendo o código.

## O eixo: a espera virou acumulador sem identidade de carga

Em FIX-12 resolvi R10-01 fazendo a tabela de espera acumular os itens até o fim da leitura, para que a consolidação fosse uma transação por pedido. Funcionou — e criou um problema que eu não previ: a tabela passou a fazer **duas coisas** com o mesmo identificador.

1. Sala de espera de órfão de qualquer carga, até o cabeçalho chegar (ADR-008).
2. Acumulador **desta** carga, entre os lotes.

Os dois papéis se contradizem: o segundo precisa de isolamento por carga, o primeiro existe justamente para atravessar cargas. Duas cargas item-only do mesmo pedido consumiam uma a da outra:

```
A gravou 1 item e consolidou 2;  B gravou 1 e consolidou 0
```

O estado final ficava certo, mas os dois relatórios mentiam. A migração `0004` acrescenta `ingestion_id`: a consolidação leva só o que é seu, a reconciliação pelo cabeçalho leva tudo. Linhas anteriores à migração ficam com `null` — órfãs de origem desconhecida, que é o que são, e só saem pelo cabeçalho.

O identificador da carga passou a nascer no **início** do caso de uso, não no retorno.

## R12-01 — o teto é do agregado, e o caminho item-only não o consultava

`maxItemsPerOrder` só era conferido quando o cabeçalho estava na carga. Dez mil e um itens sem cabeçalho entravam inteiros na espera e depois montavam um retrato acima do limite.

```
sonda: 10.001 itens sem cabecalho -> staged=10001, recusas=0
```

Validar cada item com Zod não confere **cardinalidade**. Duas correções: o adaptador passou a contar órfãos por pedido e recusar o pedido ao passar do teto, e `consolidateStaged` confere o agregado contra `normalizedOrderSchema` antes de gravar — o schema do agregado atravessando a fronteira de persistência, como o review pediu.

## R12-03 — o teto encerrava a carga depois de gravar o excesso

`maxStagedOrders` era conferido depois de `stageLooseItems`. A requisição falhava e as linhas que excederam o limite ficavam no banco. Agora o total projetado do lote é calculado antes da escrita.

## R12-04 — lote misto ainda passava do teto

Sete pontos de emissão com contabilidade independente; no `yield` final os três vetores eram somados sem conferência. Dois pedidos válidos mais dois órfãos com `batchSize=3` saíam num lote de 4.

A correção não foi mais uma verificação: foi **centralizar**. Um objeto `Lote` que conta as três categorias juntas e é consultado depois de cada inclusão — nenhuma emissão passa do teto, nem a última, por construção e não por vigilância.

## R12-05 — a amostra podia esconder justamente o que sobrou

A amostra era montada antes da consolidação e filtrada depois. Se os cem primeiros candidatos fossem todos aplicados e o centésimo primeiro continuasse esperando, o relatório saía com `stagedTotal=1` e lista vazia. Agora a amostra sai do estado que de fato sobrou, por consulta correlacionada à carga.

## Uma divergência que o meu próprio teste encontrou

Ao escrever a regressão de R12-02, o teste falhou contra o repositório em memória e passou contra o PostgreSQL. O motivo: o dobro chamava `replaceSnapshot` dentro de `consolidateStaged`, e `replaceSnapshot` consome **toda** a espera do pedido — inclusive as linhas de outra carga ainda não consolidadas. O repositório real grava direto, sem absorver.

É a mesma classe de R09-04: o dobro divergindo do real e escondendo o comportamento certo. Separei gravar de absorver nos dois.

## Evidência

Gerada por `npm run evidence -- --full`:

```
npm run check              240 testes, 0 falhas (224 sem banco, 16 pulados)
npm run test:integration    30 testes contra PostgreSQL real
npm run coverage            93,53% linhas, 90,00% branches
scripts/validate-case.mjs   27/27, duas execuções seguidas
```

Sondas depois da correção:

```
R12-01  staged=10000, recusas=1          (teto respeitado)
R12-02  A=1, B=1, salvos=2               (cada carga relatou a sua)
R12-04  lote misto batchSize=3 -> [3,1]  (dentro do teto)
```

Dos sete cenários que o review listou como faltando, seis viraram teste — incluindo o item-only contra PostgreSQL, as duas cargas concorrentes conferindo **cada relatório**, o lote misto, o teto sem efeito colateral e a amostra com mais de cem candidatos. O sétimo (caminho subprocesso do gerador com comando verde e vermelho) continua verificado só por sonda manual, porque automatizá-lo exige um `npm` falso no PATH.

## Pendências

- Espera sem expiração nem TTL global ([ADR-008](../decisions/ADR-008-ingestao.md)); `maxStagedOrders` limita a carga, não o acúmulo.
- Medição de volume do caminho Delta item-only.
- O validador afirma sobre o que cria, mas não roda em banco isolado.
- CI e política de exceção da auditoria npm, adiados pelo usuário. A imagem de migração ainda carrega o tooling do Prisma.
- Credenciais DDL e DML compartilhadas fora do ambiente local.
- Posse: reservas de FIX-13 liberadas.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam CLEAN-01 do Codex — no `schema.prisma` eu preparei o commit para levar só o campo novo. `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
