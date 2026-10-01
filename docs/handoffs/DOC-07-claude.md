# DOC-07 — uso prático do serviço

- Responsável: Claude, 2026-10-01.
- Estado: concluída.
- Origem: o usuário perguntou o que é o `clientId`, como o cliente faz a requisição hoje e — já que os identificadores são UUID — como se acha um pedido. Depois pediu que esse tipo de coisa entrasse na documentação.

## O que faltava

As três respostas estavam no código e em documento nenhum. O motivo é de papel:

- **`API.md` é referência rota a rota.** Descreve cada endpoint isoladamente. As perguntas eram **tarefas que atravessam rotas**: "quero ver os itens de um pedido do qual só sei o número" passa por duas.
- **`HARD-PARTS.md` responde por quê**, `PROJECT-GUIDE.md` responde onde fica.

Faltava o quarto papel: **como se faz**. É `docs/HOW-TO.md`.

## Forma

Pergunta como título, comando real como resposta, saída copiada de execução contra o serviço no ar. Nove seções: o que é o `clientId`, carregar pedidos, quando a carga é recusada, achar um pedido, ver os itens, conferir uma nota, paginar, ler o relatório da carga, ler o relatório das conferências.

Toda saída foi verificada antes de escrever, incluindo as recusas — `404 cliente_desconhecido`, `400 carga_invalida` com a lista de partes esperadas, `422 payload_incompativel` por versão divergente, e `cursor_invalido` ao trocar o filtro no meio da varredura.

## Um defeito que a pergunta do usuário expôs

Ele supôs que precisaria do UUID para achar um pedido. Fui ver por quê, e o `API.md` era parte da causa: os exemplos mostravam `"id": "1042"`, `"purchaseOrderId": "1042"` e `"id": "8801"` — que parecem inteiros sequenciais e sugerem que o identificador é algo que se conhece ou se adivinha. O `ingestionId` aparecia como `"01J9Z…"`, que é forma de ULID, não de UUID.

Os cinco identificadores de exemplo passaram a ser UUID v7 reais e **coerentes entre si**: o pedido tem o mesmo id na consulta, no detalhe e no `purchaseOrderId` da conferência, como aconteceria de verdade.

A rota de detalhe ganhou a nota que faltava: `{id}` é o identificador interno que vem na consulta, não o número do pedido no cliente, e quem procura um pedido usa `externalNumber`.

## Fricção registrada, não escondida

Ver os itens de um pedido do qual se sabe só o número custa **duas requisições**: filtrar por `externalNumber`, pegar o `id`, buscar o detalhe. Está escrito assim no `HOW-TO.md`, junto com a rota composta que resolveria — `GET /clients/{clientId}/purchase-orders/{externalNumber}` — e a observação de que ela não existe e não é exigida pelo enunciado.

Ofereci implementá-la; o usuário pediu documentação. Documentei e não implementei.

## Verificação

- `npm run check`: saída 0, 260 testes, 0 falhas.
- Os três links internos do `HOW-TO.md` resolvem.
- Cada comando do documento foi executado contra `http://localhost:3000` antes de entrar.

`ENGINEERING.md` ganhou uma seção "Usar o serviço" que abre o índice, antes de "Entender o sistema": quem chega querendo usar não deveria ter de atravessar a arquitetura primeiro. E `API.md` ganhou o ponteiro no topo, dizendo que é referência e onde fica a parte de tarefas.
