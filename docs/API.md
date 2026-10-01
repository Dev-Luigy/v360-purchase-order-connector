# Contrato HTTP

**Este documento é contrato e agora também descrição.** As rotas abaixo estão implementadas em P1-04 e cobertas por teste que atravessa a borda HTTP. O enunciado deixa explícito que transformar os requisitos em endpoints é decisão nossa e faz parte da avaliação.

```
POST /clients/:clientId/ingestions
GET  /purchase-orders
GET  /purchase-orders/:id
POST /conferences
GET  /conferences
GET  /conferences/summary
GET  /health
GET  /ready
```

Este documento é **referência rota a rota**. Para tarefas que atravessam rotas — achar um pedido pelo número do cliente, conferir uma nota, percorrer tudo paginando — veja [Como se faz](HOW-TO.md).

Os testes de rota usam repositório em memória; transações, locks, constraints e consultas PostgreSQL são cobertos separadamente pela suíte de integração. A validação mais recente e o escopo do banco descartável estão registrados em [STATUS](STATUS.md) e nos handoffs de teste.

## Convenções

JSON em UTF-8. Datas de calendário em `YYYY-MM-DD`, instantes em ISO 8601 UTC. **Todo decimal viaja como string** — `"45.90"`, não `45.9` — porque número JSON é ponto flutuante e dinheiro não sobrevive a isso (ADR-007). CNPJ com 14 dígitos, sem máscara.

Erro sempre na mesma forma, **plana**: `error` é código estável, para a plataforma decidir sem interpretar texto; `message` é para gente ler.

```json
{
  "error": "cursor_invalido",
  "message": "o cursor não corresponde aos filtros desta consulta"
}
```

| Código                     | HTTP | Quando                                                                       |
| -------------------------- | ---- | ---------------------------------------------------------------------------- |
| `requisicao_invalida`      | 400  | corpo ou parâmetro fora do contrato, incluindo `limit` acima do teto         |
| `cursor_invalido`          | 400  | cursor malformado ou com filtros diferentes dos da primeira página           |
| `carga_invalida`           | 400  | multipart que não dá para ler: parte repetida, nome fora da allowlist        |
| `partes_ausentes`          | 400  | nenhuma parte reconhecida para a forma de entrega do cliente                 |
| `pedido_nao_encontrado`    | 404  | conferência ou detalhe de pedido inexistente                                 |
| `cliente_desconhecido`     | 404  | `clientId` sem perfil registrado                                             |
| `carga_acima_do_limite`    | 413  | corpo maior que o teto da borda                                              |
| `tipo_nao_suportado`       | 415  | `Content-Type` que a rota não aceita                                         |
| `payload_incompativel`     | 422  | payload não corresponde ao formato declarado pelo perfil, ou chegou truncado |
| `limite_de_requisicoes`    | 429  | acima do teto por origem e minuto                                            |
| `requisicao_recusada`      | 4xx  | outra recusa que o framework já classificou                                  |
| `forma_nao_suportada`      | 501  | perfil declara forma de entrega sem adaptador registrado                     |
| `erro_interno`             | 500  | defeito nosso, sem detalhe de infraestrutura na resposta                     |
| `resposta_invalida`        | 500  | a resposta não corresponde ao schema declarado — defeito nosso               |
| `dependencia_indisponivel` | 503  | o banco de dados não está acessível                                          |

Os códigos são minúsculos com `_`, e a lista acima é conferida contra `src/presentation/http/problem.ts` por `tests/contrato-documentado.test.ts`: código novo no serviço sem linha aqui reprova a suíte.

## Ingestão

```http
POST /clients/{clientId}/ingestions
X-Format-Version: 1
Content-Type: multipart/form-data
```

As partes são nomeadas conforme a forma de entrega do cliente. Implementadas: `orders` para `nested-json`; `headers` e `items` para `paired-csv`; `lines` para `flat-json`; `orders` e `items` para `split-json`, uma ou as duas — e mandar só `orders` **não apaga** os itens já conhecidos (ADR-008).

A allowlist vive em `partsByFormat`, em `src/presentation/http/routes/ingestions.ts`; nome fora dela é recusado com 400. `tests/contrato-documentado.test.ts` obriga esta lista e aquela a concordarem.

O cliente vai no caminho e nunca é deduzido do conteúdo: Delta usa os mesmos nomes de campo do Alfa.

Resposta `200`:

```json
{
  "ingestionId": "01a0f339-c2b7-7a41-9f0e-4d2a83c15e90",
  "clientId": "alfa",
  "formatVersion": "1",
  "startedAt": "2026-09-27T12:00:00.000Z",
  "finishedAt": "2026-09-27T12:00:03.412Z",
  "ordersAccepted": 1,
  "itemsAccepted": 2,
  "rejected": [
    {
      "reference": "linha 84 de itens.csv",
      "reason": "SITUACAO fora do vocabulário do perfil: \"SUSPENSO\""
    }
  ],
  "rejectedTotal": 1,
  "staged": [
    { "reference": "DL-2026-0099", "reason": "cabecalho-ausente", "raw": "{…}" }
  ],
  "stagedTotal": 1
}
```

Um registro inválido não rejeita a carga: o resto entra e o rejeitado volta aqui com referência e motivo.

`rejected` e `staged` são **amostra**, com teto de 100; `rejectedTotal` e `stagedTotal` trazem o número inteiro. Uma carga com dez mil recusas não pode virar uma resposta sem teto, e nada fica escondido porque o total vem separado.

## Consulta de pedidos

```http
GET /purchase-orders?clientId=alfa&externalNumber=4500001234&supplierTaxId=23456789000101&status=aberto&pending=true&limit=50&cursor=
```

Todos os filtros são combináveis e convivem com a paginação. `pending=true` devolve só pedidos com algum item com saldo. `externalNumber` é o número do pedido no sistema do cliente — o mesmo que a conferência usa para identificá-lo — e pode vir sem `clientId`, porque o enunciado avisa que o mesmo número existe em clientes diferentes e procurar onde ele está é uso legítimo.

```json
{
  "data": [
    {
      "id": "01a0f339-da11-74e8-a9d6-968f3d4d7d3e",
      "clientId": "alfa",
      "externalNumber": "4500001234",
      "supplier": {
        "taxId": "23456789000101",
        "name": "Metalúrgica São Jorge S.A."
      },
      "currency": "BRL",
      "status": "aberto",
      "issuedOn": "2026-08-05",
      "itemCount": 2,
      "pendingItemCount": 2,
      "hasPendingBalance": true,
      "ingestionVersion": 3
    }
  ],
  "page": {
    "limit": 50,
    "cursor": null,
    "nextCursor": "eyJ2IjoyLCJhZnRlciI6…",
    "hasMore": true
  }
}
```

## Detalhe de um pedido

```http
GET /purchase-orders/{id}
```

`{id}` é o identificador **interno**, um UUID v7 que vem na consulta acima — não o número do pedido no cliente. Para achar um pedido você usa `externalNumber`, não o UUID; [Como se faz](HOW-TO.md#como-achar-um-pedido) mostra o caminho inteiro. A versão 7 do UUID é ordenável no tempo, e a varredura por cursor depende disso (ADR-010).

Traz o que já foi recebido e o que ainda falta em cada item. Quantidades na unidade de compra, com o fator ao lado, mais o pendente já convertido para unidade de consumo — que é a unidade em que a nota fiscal vem (ADR-007):

```json
{
  "id": "01a0f339-da11-74e8-a9d6-968f3d4d7d3e",
  "clientId": "alfa",
  "externalNumber": "4500001234",
  "supplier": {
    "taxId": "23456789000101",
    "name": "Metalúrgica São Jorge S.A."
  },
  "currency": "BRL",
  "status": "aberto",
  "issuedOn": "2026-08-05",
  "ingestionVersion": 3,
  "ingestedAt": "2026-09-27T12:00:03.412Z",
  "hasPendingBalance": true,
  "items": [
    {
      "id": "01a0f339-da12-7c05-b3f7-2e7c5a190b44",
      "externalLine": 10,
      "material": "MAT-1001",
      "description": "Chapa de aço 2mm",
      "purchaseUnit": "UN",
      "conversionFactor": "1.000000",
      "quantityOrdered": "100.000000",
      "quantityReceived": "60.000000",
      "quantityPending": "40.000000",
      "quantityPendingInConsumptionUnit": "40.000000",
      "unitPrice": "45.900000",
      "lineCreatedOn": null
    }
  ]
}
```

## Conferência de nota fiscal

```http
POST /conferences
```

```json
{
  "clientId": "alfa",
  "purchaseOrderNumber": "4500001234",
  "supplierTaxId": "23456789000101",
  "lines": [
    { "material": "MAT-1001", "quantity": "40", "totalValue": "1836.00" }
  ]
}
```

O pedido é identificado por cliente e número, não pelo nosso `id`: a plataforma conhece o número da nota, não a nossa identidade interna. Quantidade sempre em unidade de consumo.

Resposta `201`, aprovada:

```json
{
  "id": "01a0f3a4-61ce-7b2d-8c19-55e0f7d3a208",
  "purchaseOrderId": "01a0f339-da11-74e8-a9d6-968f3d4d7d3e",
  "purchaseOrderIngestionVersion": 3,
  "clientId": "alfa",
  "checkedAt": "2026-09-27T12:10:00.000Z",
  "outcome": "aprovada",
  "invoice": {
    "clientId": "alfa",
    "purchaseOrderNumber": "4500001234",
    "supplierTaxId": "23456789000101",
    "lines": [
      { "material": "MAT-1001", "quantity": "40", "totalValue": "1836.00" }
    ]
  },
  "divergences": []
}
```

A nota volta dentro do registro, e é gravada assim: o histórico precisa dizer **o que** foi conferido, não só o resultado. `purchaseOrderIngestionVersion` é a versão do pedido naquele instante, para uma recarga posterior não mudar o sentido de uma conferência antiga.

Reprovada — 50 unidades contra saldo de 40:

```json
{
  "outcome": "reprovada",
  "divergences": [
    {
      "code": "QUANTIDADE_ACIMA_DO_SALDO",
      "field": "items[0].quantity",
      "invoiceLineIndex": 0,
      "purchaseOrderLine": 10,
      "expected": "40.000000",
      "received": "50"
    }
  ]
}
```

Devolvemos **todas** as divergências, não a primeira: a plataforma precisa mostrar tudo sem adivinhar. Aprovada significa lista vazia. Pedido inexistente é `404`, não divergência — a nota pode estar certa e o pedido ainda não ter sido carregado. A taxonomia completa está em ADR-009. Conferir não consome saldo.

## Relatório de conferências

```http
GET /conferences?clientId=alfa&outcome=reprovada&divergenceCode=VALOR_TOTAL_DIVERGENTE&from=&to=&limit=50&cursor=
```

Histórico paginado, mesma envelopagem da consulta de pedidos.

```http
GET /conferences/summary?clientId=alfa&from=&to=
```

```json
{
  "checked": 1280,
  "approved": 1157,
  "rejected": 123,
  "divergencesByCode": {
    "VALOR_TOTAL_DIVERGENTE": 88,
    "QUANTIDADE_ACIMA_DO_SALDO": 51,
    "MATERIAL_AMBIGUO": 4
  }
}
```

A soma por código não fecha com `rejected`: uma nota reprovada pode ter várias divergências, e contar nota é diferente de contar ocorrência. O resumo não é paginado porque a taxonomia é fechada e a cardinalidade é limitada por construção.

## Operacionais

`GET /health` responde 200 com o processo vivo. `GET /ready` responde 200 quando a migração esperada está aplicada e 503 quando não — desde P1-02 ele confere o estado das migrações, não só a conectividade. `GET /metrics` está desenhado em [ADR-005](decisions/ADR-005-observabilidade.md) e não implementado.
