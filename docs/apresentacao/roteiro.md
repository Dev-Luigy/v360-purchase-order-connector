# Roteiro do vídeo — 3 minutos

> Arquivo de apoio para gravar a demonstração. Não é parte do produto; a pasta inteira pode ser apagada antes de enviar.
>
> Ao lado: [`chamadas.http`](chamadas.http) para clicar, [`falas.md`](falas.md) só com o texto, e
> [`perguntas.md`](perguntas.md) com as dez perguntas da avaliação respondidas.

Três minutos não dão para mostrar tudo. A escolha deste roteiro: **mostrar comportamento que prova decisão**, em vez de narrar arquitetura. Quem avalia já vai ler o README; o vídeo existe para ver funcionando.

Todos os comandos abaixo rodam em menos de 60 ms. O tempo é da sua fala, não da máquina.

## Antes de gravar

```sh
docker compose up -d
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/ready   # tem que dar 200
```

- Terminal com fonte grande, fundo escuro, janela limpa.
- Deixe os comandos num arquivo e cole um a um — digitar ao vivo come tempo.
- Para a saída ficar legível, encadeie `| jq` (ou `| python3 -m json.tool`).
- Grave em uma tomada só. Erro pequeno não justifica recomeçar.

---

## 0:00 – 0:15 · O problema

**Não mostre tela ainda. Fale olhando para a câmera.**

> "Uma empresa emite um pedido de compra, o fornecedor entrega e manda a nota, e alguém confere se a nota bate com o pedido antes de pagar. Esse serviço faz isso para quatro clientes que exportam os pedidos em formatos completamente diferentes — e entrega um contrato único."

---

## 0:15 – 0:40 · Carregar os quatro clientes

```sh
curl -X POST localhost:3000/clients/alfa/ingestions -H 'x-format-version: 1' \
  -F 'orders=@tests/fixtures/alfa/purchase-orders.json'

curl -X POST localhost:3000/clients/beta/ingestions -H 'x-format-version: 1' \
  -F 'headers=@tests/fixtures/beta/cabecalho.csv' \
  -F 'items=@tests/fixtures/beta/itens.csv'

curl -X POST localhost:3000/clients/gama/ingestions -H 'x-format-version: 1' \
  -F 'lines=@tests/fixtures/gama/purchase-order-lines.json'

curl -X POST localhost:3000/clients/delta/ingestions -H 'x-format-version: 1' \
  -F 'orders=@tests/fixtures/delta/orders.json' \
  -F 'items=@tests/fixtures/delta/items.json'
```

> "JSON aninhado, dois CSV em português com vírgula decimal, tudo achatado com timestamp Unix e centavos, e duas consultas separadas."
>
> "Mesma rota para os quatro. O que muda é o **perfil** do cliente, que é dado, não código. O cliente vai no caminho da URL e nunca é deduzido do conteúdo — o Delta usa os mesmos nomes de campo do Alfa."

---

## 0:40 – 1:15 · Requisito 1 — consulta unificada

```sh
curl -s 'localhost:3000/purchase-orders?limit=100' | jq '[.data[] | {clientId, externalNumber, status, hasPendingBalance}]'
```

> "Os quatro clientes, no mesmo contrato. Data em ISO, decimal como texto, situação em três valores. Nada aqui lembra o formato de origem."

```sh
curl -s 'localhost:3000/purchase-orders?clientId=gama&externalNumber=GL-778' | jq '.data[0]'
```

> "Acho um pedido pelo número que o cliente usa. Os ids são UUID, mas ninguém precisa decorar um: a identidade de negócio é cliente mais número, porque o mesmo número existe em clientes diferentes."

**Se o tempo apertar, corte o filtro de fornecedor e situação — a consulta acima já mostra o contrato.**

---

## 1:15 – 2:00 · Requisito 2 — conferência

Primeiro a aprovada:

```sh
curl -s -X POST localhost:3000/conferences -H 'content-type: application/json' -d '{
  "clientId": "alfa", "purchaseOrderNumber": "4500001234",
  "supplierTaxId": "23456789000101",
  "lines": [{"material": "MAT-1001", "quantity": "40", "totalValue": "1836.00"}]
}' | jq '{outcome, divergences}'
```

> "Nota conforme: aprovada, sem divergência. Repare que não precisei do UUID — a plataforma conhece o número do pedido, não a nossa identidade interna."

Agora a reprovada:

```sh
curl -s -X POST localhost:3000/conferences -H 'content-type: application/json' -d '{
  "clientId": "alfa", "purchaseOrderNumber": "4500001234",
  "supplierTaxId": "23456789000101",
  "lines": [{"material": "MAT-1001", "quantity": "500", "totalValue": "1.00"}]
}' | jq '.divergences'
```

Saída:

```
VALOR_TOTAL_DIVERGENTE      esperado 22950.00  recebido 1.00
QUANTIDADE_ACIMA_DO_SALDO   esperado 40.000000 recebido 500
```

> "Devolve **todas** as divergências, não a primeira, com código estruturado — a plataforma mostra ao usuário sem adivinhar."

E o caso que eu mais gosto:

```sh
curl -s -X POST localhost:3000/conferences -H 'content-type: application/json' -d '{
  "clientId": "gama", "purchaseOrderNumber": "GL-778",
  "supplierTaxId": "34567890000112",
  "lines": [{"material": "TRP-01", "quantity": "24", "totalValue": "2400.00"}]
}' | jq '{outcome}'
```

> "O pedido do Gama está em caixas de doze. A nota fala em unidades, como toda nota de fornecedor. Vinte e quatro unidades são duas caixas, e aprova. O fator de conversão faz a ponte, e a comparação é decimal exata — nenhum valor passa por ponto flutuante neste serviço."

---

## 2:00 – 2:25 · A parte difícil: Delta

```sh
curl -s -X POST localhost:3000/clients/delta/ingestions -H 'x-format-version: 1' \
  -F 'items=@tests/fixtures/delta/items.json' | jq '{itemsAccepted, stagedTotal, staged}'
```

Saída:

```
itemsAccepted: 3   stagedTotal: 1
staged: [{ reference: "DL-2026-0099", reason: "cabecalho-ausente" }]
```

> "As duas consultas do Delta podem não retratar o mesmo instante. Mandei só os itens, e um aponta para um pedido que eu não recebi."
>
> "Ele não vira pedido inventado nem é descartado: fica esperando, e entra quando o cabeçalho chegar — mesmo em outra requisição, horas depois. E nasce invisível para outras cargas, para duas ingestões simultâneas não consumirem uma a espera da outra."

---

## 2:25 – 2:45 · Relatório e paginação

```sh
curl -s localhost:3000/conferences/summary | jq
curl -s 'localhost:3000/purchase-orders?limit=2' | jq '.page'
```

> "Requisito três: quantas notas passaram, quantas travaram e por quais motivos."
>
> "E toda lista é paginada por cursor. O cursor carrega o recorte e o teto da varredura, então percorrer dezenas de milhares de pedidos de madrugada, enquanto novas cargas entram, termina — sem repetir nem pular nenhum."

---

## 2:45 – 3:00 · Fechamento

```sh
open http://localhost:3000/docs      # ou só mostre a aba já aberta
```

> "A API navegável é gerada dos mesmos schemas que validam as requisições, então ela não tem como divergir do serviço."
>
> "Tem mais no repositório: trinta asserções, uma por exigência do enunciado, contra o serviço no ar; e uma auditoria que compara campo a campo o arquivo de entrada com o que ficou no banco. Obrigado."

---

## Se sobrar tempo

Corte alguma coisa acima e mostre **uma** destas — nesta ordem de preferência:

```sh
node scripts/validate-case.mjs      # 30/30, uma asserção por exigência do enunciado
npm run audit:fidelity              # 156 campos: o arquivo de entrada contra o banco
```

A primeira é a mais forte para quem avalia: é a lista do enunciado virando teste executável.

## Se algo falhar ao vivo

Não corte. Diga o que aconteceu e siga — a recuperação explica mais sobre você do que a tomada perfeita. Se o serviço não responder, `docker compose up -d` e `/ready` em 200 resolvem em segundos.
