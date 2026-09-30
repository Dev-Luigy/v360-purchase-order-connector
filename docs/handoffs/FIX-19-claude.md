# FIX-19 — o contrato de erro publicado não era o do serviço

- Responsável: Claude, 2026-09-30.
- Estado: concluída.
- Origem: pergunta do usuário — está certo? entregamos tudo? temos todos os filtros e todas as rotas necessárias?

## A resposta às três perguntas

**Rotas: completas.** Cada exigência do enunciado tem endpoint, e nenhum endpoint existe sem exigência que o justifique.

| Exigência do enunciado                                  | Rota                                  |
| ------------------------------------------------------- | ------------------------------------- |
| Consultar pedidos de todos os clientes em formato único | `GET /purchase-orders`                |
| Detalhe de um pedido, com recebido e pendente por item  | `GET /purchase-orders/{id}`           |
| Conferir uma nota fiscal contra um pedido               | `POST /conferences`                   |
| Relatório das conferências: quantas passaram e por quê  | `GET /conferences/summary`            |
| — histórico paginado e filtrável                        | `GET /conferences`                    |
| Forma de ingestão (decisão nossa)                       | `POST /clients/{clientId}/ingestions` |
| Operação                                                | `GET /health`, `GET /ready`           |

**Filtros: completos.** O enunciado nomeia quatro e há um quinto:

| Pedido pelo enunciado                     | Parâmetro        |
| ----------------------------------------- | ---------------- |
| por cliente de origem                     | `clientId`       |
| por fornecedor                            | `supplierTaxId`  |
| por situação do pedido                    | `status`         |
| apenas os que ainda têm algo a receber    | `pending=true`   |
| _(além do pedido)_ pelo número do cliente | `externalNumber` |

Todos combináveis e convivendo com a paginação, como o enunciado exige. O relatório tem os seus: `clientId`, `outcome`, `divergenceCode`, `from`, `to`.

**Está certo? Quase.** A pergunta valeu a pena.

## O defeito

`docs/API.md` publicava o erro assim:

```json
{ "error": { "code": "CURSOR_INVALIDO", "message": "…" } }
```

O serviço responde assim:

```json
{ "error": "cursor_invalido", "message": "…" }
```

Forma diferente **e** caixa diferente. Quem integrasse lendo a documentação escreveria `err.error.code` e receberia `undefined` em toda recusa — e o enunciado é explícito em que a plataforma precisa agir sobre o erro sem adivinhar.

Pior no detalhe: dos seis códigos listados, **dois não existiam** no código (`LIMITE_ACIMA_DO_TETO` e `FORMATO_INESPERADO`), e dos quinze que o serviço de fato emite, **nove** não estavam documentados.

O serviço não tem defeito aqui: `problemSchema` é plano e é aplicado na serialização, e o documento gerado em `/docs` sempre mostrou a forma certa. Quem mentia era o Markdown escrito à mão.

Mais dois exemplos desatualizados, achados na varredura que fiz depois do primeiro:

- o relatório de carga aparecia sem `rejectedTotal` e `stagedTotal` — que são exatamente o que sustenta a decisão "a lista é amostra com teto de 100". Sem eles, quem lê conclui que `rejected.length` é o total;
- a conferência aparecia sem `invoice`, que é o que o histórico existe para guardar: sem ele o registro diz o resultado e não diz o que foi conferido.

E duas defasagens menores: o cursor de exemplo ainda era `v:1` (está em 2) e `conversionFactor` aparecia como `"1"` quando a resposta traz `"1.000000"`.

## Por que passou por tudo

`tests/contrato-documentado.test.ts` **já existia** para este fim, e já tinha pego três derivas: o cabeçalho da ingestão, os nomes de parte e os limites de página. Ele cobria essas três e nada mais. O contrato de erro e a forma das respostas nunca estiveram sob trava.

É a mesma classe de sempre — duas fontes de verdade que ninguém obriga a concordar — num quarto lugar.

## A correção

Documentação corrigida, e a trava estendida. Agora o teste exige que:

1. todo código que o serviço emite esteja na tabela do `API.md` — lidos de `problem.ts`, incluindo os que saem por `return` em `frameworkCode`, e das três rotas de negócio;
2. a tabela não anuncie código que o serviço não emite;
3. o exemplo de erro publicado seja plano, como `problemSchema`;
4. os exemplos de relatório de carga, conferência e resumo tenham exatamente os campos do schema que define cada resposta.

## Provei que recusa

Uma trava exercitada só no caminho feliz passa também quando não verifica nada:

| Cenário                         | Saída | Esperado |
| ------------------------------- | ----: | -------: |
| documentação correta            |     0 |        0 |
| exemplo sem `rejectedTotal`     |     1 |        1 |
| código de volta em maiúscula    |     1 |        1 |
| erro de volta na forma aninhada |     1 |        1 |

## Verificação

- `npm run check`: saída 0, **254 testes, 0 falhas** (eram 251; três asserções novas).
- Os quinze códigos foram lidos do código, não da memória: `problem.ts` e as três rotas.
- Valores dos exemplos conferidos contra o serviço no ar, não contra o schema: `conversionFactor` real é `"1.000000"`, o cursor decodifica para `{"v":2,…}`.

## Observação sobre o alcance

Comparei os exemplos do `API.md` contra respostas reais com um script descartável. Dois "achados" dele eram falso positivo — chaves dentro de listas vazias, que o comparador não enxerga. Os quatro reais estão acima. O script não ficou no repositório porque a trava no teste cobre o mesmo de forma durável e sem exigir o serviço no ar.
