# Handoff: REVIEW-13 — verificação pós-FIX-13 pela aplicação real

- Agente e data: Codex, 2026-09-29.
- Estado: concluída como revisão; nenhuma correção de produção aplicada.
- Objetivo: conferir os seis fechamentos declarados em FIX-13 e, por solicitação explícita do usuário, provar o comportamento pelas rotas HTTP da aplicação em execução, usando PostgreSQL e objetos no formato das fixtures.

## Resultado executivo

O baseline verdadeiro está saudável: os containers de API e banco estavam `healthy`, `/health` e `/ready` responderam 200, e `scripts/validate-case.mjs` carregou as fixtures de Alfa, Beta, Gama e Delta por multipart HTTP e terminou 27/27. Isso prova o caminho feliz do desafio.

FIX-13, porém, não fecha todos os achados de REVIEW-12. A identidade de carga funciona quando as cargas usam linhas distintas, mas continua quebrando quando disputam a mesma `externalLine`, porque a chave única da tabela ignora `ingestionId` e o `upsert` transfere a linha de uma carga para outra. O teto item-only também continua aceitando parcialmente as primeiras 10.000 linhas enquanto afirma que recusou o pedido inteiro. Uma falha de validação do agregado fica invisível no relatório e, na reconciliação seguinte por cabeçalho, pode apagar itens válidos do retrato anterior.

| Achado anterior | Resultado com FIX-13                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| R12-01          | **Não fechado**: 10.001 linhas aceitam e persistem as primeiras 10.000; outro caminho perde item preexistente após falha do agregado.  |
| R12-02          | **Parcial**: linhas distintas ficam isoladas; mesmas linhas concorrentes ainda trocam de dono entre ingestões.                         |
| R12-03          | Fechado no caso de uso: o total projetado é conferido antes de `stageLooseItems`.                                                      |
| R12-04          | Fechado: `Lote` contabiliza as três categorias e a sonda mista passou.                                                                 |
| R12-05          | **Parcial**: o caso dos 101 candidatos fechou, mas duplicata e concorrência ainda geram `stagedTotal > 0` com amostra e tabela vazias. |
| R12-06          | Fechado: STATUS agora declara “após FIX-13”.                                                                                           |

## Teste verdadeiro executado

Não usei `app.inject`, repositório em memória nem chamada direta de caso de uso como evidência principal. As sondas fizeram `fetch` em `http://127.0.0.1:3000`, enviaram `multipart/form-data` para `POST /clients/delta/ingestions` e conferiram o resultado por `GET /purchase-orders` e `GET /purchase-orders/:id`.

Também executei o validador oficial, que usa as fixtures versionadas:

```text
tests/fixtures/alfa/purchase-orders.json
tests/fixtures/beta/cabecalho.csv
tests/fixtures/beta/itens.csv
tests/fixtures/gama/purchase-order-lines.json
tests/fixtures/delta/orders.json
tests/fixtures/delta/items.json

node scripts/validate-case.mjs -> 27/27 exigências pelas rotas reais
```

## Achados novos

### R13-01 — crítica: `ingestionId` não isola a mesma linha entre cargas concorrentes

A migração adiciona `ingestion_id`, mas mantém a unicidade em `(clientId, externalNumber, externalLine)`. `stageItem` usa essa chave no `upsert` e, em conflito, atualiza também `ingestionId`. Logo, uma carga pode tomar a linha que a outra já gravou.

Sonda HTTP real: duas requisições simultâneas, 401 linhas cada, mesmos números de linha e materiais diferentes.

```json
{
  "A": { "itemsAccepted": 201, "stagedTotal": 200, "stagedSample": 0 },
  "B": { "itemsAccepted": 201, "stagedTotal": 200, "stagedSample": 0 },
  "savedItems": 401,
  "ingestionVersion": 3
}
```

As duas respostas foram HTTP 200. Ambas afirmaram ter 200 linhas esperando; ao final não havia linha dessas cargas em staging. A soma dos relatórios distribui 802 entradas entre “aceitas” e “esperando”, mas o retrato tem 401 linhas. O estado final segue a substituição por linha, porém os relatórios por ingestão continuam falsos.

O teste de integração chamado “duas cargas simultâneas” não reproduz isso: grava A, grava B, consolida A e depois consolida B, tudo sequencialmente, e usa linhas diferentes. O teste de caso de uso usa `Promise.all`, mas também linhas diferentes.

Critério de aceite: a identidade da linha transitória precisa incluir a carga, por exemplo `(clientId, ingestionId, externalNumber, externalLine)`, com uma política explícita e determinística para reconciliar versões concorrentes da mesma linha. O relatório de cada requisição deve corresponder às linhas que ela própria aceitou, recusou ou realmente deixou esperando.

### R13-02 — alta: duplicata na mesma carga fabrica staging inexistente

Sonda HTTP real: pedido existente, carga item-only com duas ocorrências da mesma `externalLine`.

```json
{
  "inputRecords": 2,
  "itemsAccepted": 1,
  "stagedTotal": 1,
  "stagedSample": 0,
  "savedItems": 1,
  "savedMaterial": "SEGUNDO"
}
```

O `upsert` aplica “último vence”, mas `esperandoPorPedido` conta as duas ocorrências. Depois o caso de uso calcula `total - aplicados`, tratando a ocorrência sobrescrita como se ainda estivesse em staging. A consulta correlacionada não encontra nenhuma linha, por isso a amostra fica vazia.

Critério de aceite: decidir e documentar se duplicata idêntica/discordante na mesma carga é substituição, recusa do pedido ou ocorrência aceita. A contagem deve sair do estado persistido/resultado estruturado do repositório, não de `entradas - linhas únicas aplicadas`.

### R13-03 — crítica: “pedido inteiro recusado” persiste 10.000 de 10.001 itens

Sonda HTTP real: cabeçalho existente e uma carga item-only com 10.001 linhas válidas.

```json
{
  "itemsAccepted": 10000,
  "rejectedTotal": 1,
  "rejectedReason": "mais de 10000 itens sem cabeçalho; o pedido inteiro foi recusado",
  "stagedTotal": 0,
  "itemCountAfterRequest": 10000
}
```

O adaptador já havia emitido e o caso de uso já havia persistido os primeiros 10.000 itens em lotes quando leu a linha 10.001. Marcar o pedido em `orfaosEstourados` apenas impede novas inclusões; não desfaz o que atravessou lotes anteriores. O teste novo codifica esse comportamento ao esperar `staged === 10000` e uma rejeição, apesar de a mensagem dizer que o pedido inteiro foi recusado.

Isso mantém R12-01 aberto. O critério registrado em REVIEW-12 era: 10.001 itens recusam o pedido inteiro sem alterar o retrato anterior.

### R13-04 — crítica: falha do agregado fica escondida e a reconciliação seguinte perde item válido

Fluxo integral pelas rotas:

1. criei um pedido Delta com um item;
2. enviei 10.000 novas linhas por item-only;
3. `consolidateStaged` montou 10.001 e o Zod recusou;
4. a transação preservou as 10.000 linhas em staging, mas o relatório declarou zero;
5. reenviei somente o cabeçalho;
6. `replaceSnapshot` consumiu as linhas escondidas e substituiu o retrato anterior.

```json
{
  "failedReport": {
    "itemsAccepted": 0,
    "rejectedTotal": 1,
    "stagedTotal": 0,
    "stagedSample": 0
  },
  "itemCountAfterFailure": 1,
  "headerOnlyReport": {
    "ordersAccepted": 1,
    "itemsAccepted": 10000,
    "rejectedTotal": 0
  },
  "itemCountAfterHeader": 10000
}
```

O item original desapareceu: preservar o conhecido e acrescentar a espera produziria 10.001 e deveria ser recusado, não substituir 1 por 10.000.

Há três causas combinadas:

- o `catch` de `consolidateStaged` adiciona uma rejeição, mas não conta como staging as linhas cuja exclusão foi revertida;
- `replaceSnapshot` aplica `mergeWaitingItems` sobre o snapshot recebido, não sobre os itens já persistidos quando `items === null`;
- a validação de agregado foi adicionada em `consolidateStaged`, mas não depois do merge de espera em `replaceSnapshot`.

Critério de aceite: qualquer caminho que combine retrato e espera deve partir do estado correto, validar o agregado completo antes de persistir e preservar tanto o retrato anterior quanto as linhas de espera se falhar. O relatório precisa refletir o estado final verdadeiro.

## O que passou

```text
docker compose ps                      API e PostgreSQL healthy
GET /health                            200
GET /ready                             200
node scripts/validate-case.mjs         27/27 via HTTP e fixtures reais
npm run check                          240 testes, 0 falhas, 16 pulados
npm run test:integration               30/30 contra PostgreSQL real
concorrência HTTP, linhas distintas    cada carga aceitou 1; pedido terminou com 2
```

Os checks verdes não contradizem os achados: os cenários ausentes são duplicidade de chave, interleaving da mesma linha, efeito acumulado entre lotes e sequência falha → reconciliação.

## Instrução obrigatória para Claude no próximo fix

O próximo trabalho não deve ser encerrado apenas com teste unitário, `app.inject`, repositório em memória ou chamada direta de Prisma. Esses testes continuam úteis, mas são evidência complementar.

Antes de declarar o próximo fix concluído:

1. Subir a revisão atual da aplicação e migrações com `docker compose up -d --build` e aguardar `/ready` em 200.
2. Executar `node scripts/validate-case.mjs` pelo menos duas vezes. Ele precisa carregar, pelas rotas multipart, as fixtures dos quatro clientes e continuar em 27/27.
3. Criar e versionar um script de aceitação HTTP, sugerido como `scripts/validate-fix-14-http.mjs`. Ele deve usar `fetch` contra a porta 3000; não pode importar `buildApp`, repositórios, casos de uso ou usar `app.inject` como prova principal.
4. Pelo script HTTP, semear cabeçalhos e itens por `POST /clients/delta/ingestions` e conferir os efeitos por `GET /purchase-orders` e `GET /purchase-orders/:id`.
5. Cobrir obrigatoriamente:
   - duas cargas simultâneas com linhas distintas;
   - duas cargas simultâneas com as **mesmas** linhas;
   - duplicata da mesma linha dentro de uma carga;
   - 10.000 e 10.001 itens, verificando que o retrato anterior não muda no excesso;
   - pedido com item preexistente + carga que faz o agregado exceder o teto + reenvio só de cabeçalho;
   - staging real e amostra/total do relatório coerentes depois de sucesso e falha;
   - ingestão das fixtures Alfa/Beta/Gama/Delta, consulta/detalhe, `POST /conferences`, histórico e resumo.
6. Para cada cenário, afirmar simultaneamente status HTTP, corpo do relatório e estado observável pelas rotas. Consulta SQL pode complementar o teste de staging, mas não substituir a passagem pela API.
7. Usar identificadores únicos e banco isolado ou limpeza direcionada, para o script ser repetível sem depender do conteúdo anterior.
8. Registrar no handoff os comandos e os corpos essenciais das respostas. “O teste passou no repositório” não basta para afirmar que a aplicação passou.
9. Depois, executar `npm run check`, `npm run test:integration`, o validador geral e o novo validador HTTP.

## Direção técnica sugerida

- Separar de verdade o acumulador por carga da espera durável, ou incluir `ingestionId` na identidade física da linha transitória. Um campo que muda no `upsert` não fornece isolamento.
- Consolidar versões da mesma linha sob o advisory lock com ordem determinística e política explícita de último vencedor.
- Fazer o repositório devolver um resultado estruturado (`applied`, `remaining`, `overwritten`/`rejected`) ou consultar contagem real; não inferir staging por subtração de contagens com granularidades diferentes.
- Dar ao caso de uso uma operação de cancelar/purgar as linhas já emitidas de um pedido que estourou o teto em lote posterior. A rejeição precisa desfazer os primeiros lotes.
- Passar toda combinação de snapshot + espera por `normalizedOrderSchema`, tanto em `consolidateStaged` quanto em `replaceSnapshot`.
- Em carga só de cabeçalho, combinar espera com os itens persistidos, não substituir os conhecidos pela espera.

Nenhuma biblioteca adicional resolve esses problemas: são identidade, atomicidade e semântica de relatório. Zod já é adequado para a validação do agregado; falta aplicá-lo em todas as rotas de merge.

## Higiene do ambiente

As sondas criaram somente pedidos com prefixo `R13-`. Depois de capturar a evidência, removi de forma direcionada 5 pedidos temporários e 20.404 itens associados. A remoção não é recuperável, mas todos eram dados sintéticos reproduzíveis pelos scripts temporários; nenhum dado das fixtures ou do usuário foi apagado.

## Arquivos e posse

- Alterados nesta revisão: `docs/TASKS.md` e este handoff.
- Não alterados: código de produção, testes, migrações, dependências, lockfile e `docs/STATUS.md`.
- Mudanças preexistentes de CLEAN-01 em `Dockerfile`, `compose.yaml`, `prisma/schema.prisma` e a remoção de `scripts/activate-node.sh` foram preservadas sem edição.
