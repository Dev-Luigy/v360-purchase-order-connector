# Como se faz

Perguntas práticas, com o comando que as responde. Toda saída aqui foi copiada de uma execução real contra o serviço no ar.

Os outros documentos têm papéis diferentes: [API.md](API.md) é a referência rota a rota, [HARD-PARTS.md](HARD-PARTS.md) explica por que o sistema é assim e [PROJECT-GUIDE.md](PROJECT-GUIDE.md) diz onde fica cada coisa no código. Aqui é só o que fazer.

Tudo abaixo assume `docker compose up` e a API em `http://localhost:3000`.

---

## O que é o `clientId`, e de onde ele sai

É o identificador do cliente de origem, **atribuído por nós**. Ele existe porque o enunciado exige filtro por cliente de origem e **nenhum dos quatro formatos traz um identificador de cliente** — Alfa manda `po_number`, Beta manda `NUMERO_PEDIDO`, nenhum diz quem é.

Como o identificador não pode vir do conteúdo, ele vem da ingestão, no caminho da URL. Ele faz três trabalhos:

- é **metade da identidade do pedido**, `(clientId, externalNumber)`, porque o mesmo número existe em clientes diferentes;
- é a **chave que escolhe o perfil**: qual adaptador, formato de data, notação de número e vocabulário de situação usar;
- é o **filtro** da consulta.

Os perfis registrados hoje:

| `clientId` | Cliente                                  | Forma de entrega             |
| ---------- | ---------------------------------------- | ---------------------------- |
| `alfa`     | Alfa Energia                             | `nested-json`                |
| `beta`     | Beta Alimentos                           | `paired-csv`                 |
| `beta-erp` | Beta Alimentos, exportação do ERP legado | `paired-csv` em Windows-1252 |
| `gama`     | Gama Logística                           | `flat-json`                  |
| `delta`    | Delta Distribuição                       | `split-json`                 |

`beta-erp` é o mesmo cliente de negócio com outra exportação. Como o `clientId` é nosso e não dele, a variante entra como origem separada sem código novo.

---

## Como carregar pedidos

```http
POST /clients/{clientId}/ingestions
X-Format-Version: 1
Content-Type: multipart/form-data
```

O nome de cada parte depende da forma de entrega, e a lista é fechada:

| Forma         | Partes aceitas     | Obrigatórias                   |
| ------------- | ------------------ | ------------------------------ |
| `nested-json` | `orders`           | `orders`                       |
| `paired-csv`  | `headers`, `items` | as duas                        |
| `flat-json`   | `lines`            | `lines`                        |
| `split-json`  | `orders`, `items`  | nenhuma: uma, outra ou as duas |

```sh
# Alfa — uma parte
curl -X POST http://localhost:3000/clients/alfa/ingestions \
  -H 'x-format-version: 1' \
  -F 'orders=@tests/fixtures/alfa/purchase-orders.json'
```

```json
{
  "clientId": "alfa",
  "ordersAccepted": 1,
  "itemsAccepted": 2,
  "rejectedTotal": 0
}
```

```sh
# Beta — duas partes
curl -X POST http://localhost:3000/clients/beta/ingestions \
  -H 'x-format-version: 1' \
  -F 'headers=@tests/fixtures/beta/cabecalho.csv' \
  -F 'items=@tests/fixtures/beta/itens.csv'
```

```json
{ "clientId": "beta", "ordersAccepted": 2, "itemsAccepted": 3 }
```

**O cliente vai no caminho e nunca é deduzido do conteúdo.** Delta usa exatamente os mesmos nomes de campo do Alfa — é o mesmo produto de mercado em outra versão —, então dedução quebraria justo onde mais dói.

**A versão do formato é recusa, não tentativa.** Se o ERP do cliente mudar, isso vira perfil novo e versão nova.

### Quando a carga é recusada

| Situação                                           | Resposta                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `clientId` sem perfil                              | `404 cliente_desconhecido`                                           |
| parte com nome fora da forma, como `lines` no Alfa | `400 carga_invalida: parte inesperada "lines"; esperadas: orders`    |
| `x-format-version: 2` com perfil na versão 1       | `422 payload_incompativel: carga na versão 2 com perfil na versão 1` |
| sem o cabeçalho de versão                          | `400 requisicao_invalida`                                            |

A lista completa de códigos está em [API.md](API.md#convenções).

---

## Como achar um pedido

**Os identificadores são UUID, mas você nunca precisa decorar um.** O UUID é identidade interna; a identidade de negócio é `(clientId, externalNumber)` — o número que o cliente usa.

```sh
curl 'http://localhost:3000/purchase-orders?clientId=alfa&externalNumber=4500001234'
```

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
      "status": "aberto",
      "issuedOn": "2026-08-05",
      "itemCount": 2,
      "pendingItemCount": 2,
      "hasPendingBalance": true,
      "ingestionVersion": 6
    }
  ],
  "page": { "limit": 50, "cursor": null, "nextCursor": null, "hasMore": false }
}
```

O filtro `externalNumber` funciona **sem** `clientId` também: como o mesmo número existe em clientes diferentes, procurar onde o pedido está é uso legítimo e devolve todas as origens que o têm.

Os filtros combinam entre si e com a paginação:

| Filtro           | Para quê                                   |
| ---------------- | ------------------------------------------ |
| `clientId`       | cliente de origem                          |
| `externalNumber` | número do pedido no sistema do cliente     |
| `supplierTaxId`  | CNPJ do fornecedor, 14 dígitos sem máscara |
| `status`         | `aberto`, `encerrado` ou `bloqueado`       |
| `pending=true`   | só os que ainda têm algo a receber         |

---

## Como ver os itens de um pedido

A rota de detalhe é a **única** que pede o identificador interno:

```sh
ID=$(curl -s 'http://localhost:3000/purchase-orders?clientId=alfa&externalNumber=4500001234' \
     | jq -r '.data[0].id')
curl "http://localhost:3000/purchase-orders/$ID"
```

Ela traz, item a item, o que já foi recebido e o que falta — com o saldo também convertido para unidade de consumo, que é a unidade em que a nota fiscal vem.

**Isso custa duas requisições quando você só sabe o número do pedido**, e é uma fricção conhecida. Uma rota composta — `GET /clients/{clientId}/purchase-orders/{externalNumber}` — resolveria em uma; ela não existe hoje, e não é exigida pelo enunciado. Para quem só precisa dos campos do resumo, a consulta por filtro já responde em uma requisição.

---

## Como conferir uma nota fiscal

**Não precisa de UUID nenhum.** O pedido é identificado por cliente e número, porque a plataforma conhece o número que veio na nota, não a nossa identidade interna.

```sh
curl -X POST http://localhost:3000/conferences \
  -H 'content-type: application/json' \
  -d '{
    "clientId": "alfa",
    "purchaseOrderNumber": "4500001234",
    "supplierTaxId": "23456789000101",
    "lines": [{ "material": "MAT-1001", "quantity": "40", "totalValue": "1836.00" }]
  }'
```

Conforme, responde `201` com `"outcome": "aprovada"` e `divergences: []`.

Divergente, diz **tudo** o que não bate, não a primeira coisa:

```json
{
  "outcome": "reprovada",
  "divergences": [
    {
      "code": "VALOR_TOTAL_DIVERGENTE",
      "expected": "22950.00",
      "received": "1.00"
    },
    {
      "code": "QUANTIDADE_ACIMA_DO_SALDO",
      "expected": "40.000000",
      "received": "500"
    }
  ]
}
```

Três coisas que valem saber:

- **quantidade sempre em unidade de consumo.** Se o pedido está em caixa, o fator de conversão faz a ponte, e a comparação é decimal exata;
- **conferir não consome saldo.** É um julgamento registrado, não uma baixa;
- **pedido inexistente é `404`, não divergência.** A nota pode estar certa e o pedido ainda não ter sido carregado.

---

## Como percorrer tudo, paginando

Tamanho padrão 50, teto 100. `limit` acima do teto é **recusado**, não recortado em silêncio.

```sh
curl 'http://localhost:3000/purchase-orders?limit=2'
```

```json
"page": { "limit": 2, "cursor": null, "nextCursor": "eyJ2IjoyLCJhZnRlciI6IjAxYTBm…", "hasMore": true }
```

Enquanto `hasMore` for verdadeiro, mande o `nextCursor` de volta em `cursor`. A varredura é um **retrato**: o teto é fixado na primeira página, então ela termina mesmo com cargas entrando durante a leitura, e o que entrar depois fica para a próxima.

**Trocar um filtro no meio é recusado**, em vez de devolver em silêncio uma página de outro conjunto:

```json
{
  "error": "cursor_invalido",
  "message": "cursor inválido: os filtros mudaram desde a página anterior; recomece a varredura"
}
```

---

## Como ler o relatório de uma carga

```json
{
  "ordersAccepted": 1,
  "itemsAccepted": 2,
  "rejected": [{ "reference": "linha 84 de itens.csv", "reason": "…" }],
  "rejectedTotal": 1,
  "staged": [
    { "reference": "DL-2026-0099", "reason": "cabecalho-ausente", "raw": "{…}" }
  ],
  "stagedTotal": 1
}
```

- `rejected` e `staged` são **amostra**, com teto de 100; `rejectedTotal` e `stagedTotal` trazem o número inteiro. Nada fica escondido, só não cabe tudo numa resposta;
- **rejeitado** é registro que não entra: o resto da carga entra assim mesmo;
- **em espera** é item que chegou sem o cabeçalho dele, no caso do Delta. Ele não vira pedido inventado — fica guardado e entra no retrato quando o cabeçalho chegar, mesmo que seja em outra requisição, horas depois.

```sh
# itens do Delta sem mandar os cabeçalhos
curl -X POST http://localhost:3000/clients/delta/ingestions \
  -H 'x-format-version: 1' -F 'items=@tests/fixtures/delta/items.json'
#   itensAceitos: 3 | emEspera: 1
#   espera: DL-2026-0099 -> cabecalho-ausente
```

Mandar só `orders` para o Delta **não apaga** os itens já conhecidos.

---

## Como ver o relatório das conferências

```sh
curl 'http://localhost:3000/conferences/summary?clientId=alfa'
```

```json
{ "checked": 3, "approved": 3, "rejected": 0, "divergencesByCode": {} }
```

A soma de `divergencesByCode` **não** fecha com `rejected`: uma nota reprovada pode ter várias divergências, como no exemplo acima, que tem duas.

O histórico completo é paginado e filtrável por `clientId`, `outcome`, `divergenceCode`, `from` e `to`:

```sh
curl 'http://localhost:3000/conferences?outcome=reprovada&divergenceCode=VALOR_TOTAL_DIVERGENTE'
```

Cada registro guarda a nota como ela foi conferida e a versão do pedido naquele instante, para uma recarga posterior não mudar o sentido de uma conferência antiga.

---

## Como exercitar tudo de uma vez

```sh
node scripts/validate-case.mjs   # 30 asserções, uma por exigência do enunciado
npm run validate:http            # 17 cenários pelas rotas, inclusive as falhas
npm run audit:fidelity           # 156 campos: o arquivo de entrada contra o banco
```

E a API navegável, com as rotas e os objetos: <http://localhost:3000/docs>.
