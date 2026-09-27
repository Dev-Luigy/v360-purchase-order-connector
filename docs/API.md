# Contrato HTTP

**Este documento é contrato, não descrição do que existe.** Hoje apenas `GET /health` e `GET /ready` estão implementados; o resto é o que P1-04 vai expor, decidido em P1-01. O enunciado deixa explícito que transformar os requisitos em endpoints é decisão nossa e faz parte da avaliação.

## Convenções

JSON em UTF-8. Datas de calendário em `YYYY-MM-DD`, instantes em ISO 8601 UTC. **Todo decimal viaja como string** — `"45.90"`, não `45.9` — porque número JSON é ponto flutuante e dinheiro não sobrevive a isso (ADR-007). CNPJ com 14 dígitos, sem máscara.

Erro sempre na mesma forma:

```json
{
  "error": {
    "code": "CURSOR_INVALIDO",
    "message": "O cursor não corresponde aos filtros desta consulta."
  }
}
```

| Código                  | HTTP | Quando                                                   |
| ----------------------- | ---- | -------------------------------------------------------- |
| `REQUISICAO_INVALIDA`   | 400  | corpo ou parâmetro fora do contrato                      |
| `LIMITE_ACIMA_DO_TETO`  | 400  | `limit` maior que 100 (ADR-010)                          |
| `CURSOR_INVALIDO`       | 400  | cursor malformado ou com filtros diferentes              |
| `CLIENTE_DESCONHECIDO`  | 404  | `clientId` sem perfil registrado                         |
| `PEDIDO_NAO_ENCONTRADO` | 404  | conferência ou detalhe de pedido inexistente             |
| `FORMATO_INESPERADO`    | 422  | payload não corresponde ao formato declarado pelo perfil |

## Ingestão

```http
POST /clients/{clientId}/ingestions
X-Source-Format-Version: 1
Content-Type: multipart/form-data
```

As partes são nomeadas conforme a forma de entrega do cliente: `purchase-orders` para `nested-json`; `cabecalho` e `itens` para `paired-csv`; `purchase-order-lines` para `flat-json`; `orders` e `items` para `split-json`, uma ou as duas — e mandar só `orders` **não apaga** os itens já conhecidos (ADR-008).

O cliente vai no caminho e nunca é deduzido do conteúdo: Delta usa os mesmos nomes de campo do Alfa.

Resposta `200`:

```json
{
  "ingestionId": "01J9Z…",
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
  "staged": [
    { "reference": "DL-2026-0099", "reason": "cabecalho-ausente", "raw": "{…}" }
  ]
}
```

Um registro inválido não rejeita a carga: o resto entra e o rejeitado volta aqui com referência e motivo.

## Consulta de pedidos

```http
GET /purchase-orders?clientId=alfa&supplierTaxId=23456789000101&status=aberto&pending=true&limit=50&cursor=
```

Todos os filtros são combináveis e convivem com a paginação. `pending=true` devolve só pedidos com algum item com saldo.

```json
{
  "data": [
    {
      "id": "1042",
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
    "nextCursor": "eyJ2IjoxLCJhZnRlciI6…",
    "hasMore": true
  }
}
```

## Detalhe de um pedido

```http
GET /purchase-orders/{id}
```

Traz o que já foi recebido e o que ainda falta em cada item. Quantidades na unidade de compra, com o fator ao lado, mais o pendente já convertido para unidade de consumo — que é a unidade em que a nota fiscal vem (ADR-007):

```json
{
  "id": "1042",
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
      "id": "8801",
      "externalLine": 10,
      "material": "MAT-1001",
      "description": "Chapa de aço 2mm",
      "purchaseUnit": "UN",
      "conversionFactor": "1",
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
  "id": "5501",
  "purchaseOrderId": "1042",
  "purchaseOrderIngestionVersion": 3,
  "clientId": "alfa",
  "checkedAt": "2026-09-27T12:10:00.000Z",
  "outcome": "aprovada",
  "divergences": []
}
```

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

`GET /health` responde 200 com o processo vivo. `GET /ready` responde 200 com o banco acessível e 503 quando não — hoje verifica só conectividade, não a existência das tabelas, limitação registrada em [REVIEW-02](handoffs/REVIEW-02-claude.md) e mantida por decisão do usuário. `GET /metrics` está desenhado em [ADR-005](decisions/ADR-005-observabilidade.md) e não implementado.
