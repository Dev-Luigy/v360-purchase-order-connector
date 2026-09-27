# ADR-012 — Notação numérica por natureza do campo, e pool por caminho

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Claude; tarefa FIX-04.
- Autoridade: decisão autorizada pelo usuário em resposta aos pontos abertos de [FIX-03](../handoffs/FIX-03-claude.md), levantados em [REVIEW-02](../handoffs/REVIEW-02-claude.md) e [REVIEW-03](../handoffs/REVIEW-03-codex.md).

## Contexto

Duas decisões que P1-03 adiou vinham do mesmo tipo de erro: uma configuração única onde a realidade tem duas.

**Notação numérica.** `ClientProfile.numberFormat` era uma só por cliente, aplicada a todo campo numérico. O Gama não cabe nisso: na mesma linha, `qtd_ped` é `10` e `fator_conv` é `12` em inteiro simples, enquanto `preco_unit_centavos` é `120000` em centavos. Declarar `cents` para o cliente converteria também quantidade e fator, que virariam `0,10` e `0,12` — erro de cem vezes, em silêncio, exatamente na classe que ADR-007 existe para impedir. Alfa e Beta não expõem o problema porque cada um usa uma notação só para tudo.

**Pool de banco.** Um pool com `query_timeout: 3000` servia aos dois caminhos. É correto para `/ready`, que precisa desistir rápido para o `healthcheck` do Compose ter sentido, e mataria no meio uma transação de carga sobre dezenas de milhares de registros.

## Decisão

**A notação passa a ser declarada por natureza do campo**, não por cliente: `numberFormat: { quantity, money }`. Quantidade pedida, quantidade recebida e fator de conversão são medida; preço unitário é dinheiro.

A divisão é por natureza e não por campo individual porque é assim que os ERPs tratam o assunto — dinheiro tem uma convenção, medida tem outra — e duas chaves descrevem os quatro clientes do desafio. Se algum cliente futuro precisar de notação por campo, o lugar é o mapa de campos, que já existe, e não mais uma dimensão aqui.

**O pool passa a ser criado por propósito**, em `src/infrastructure/database/pool.ts`: `request` mantém o tempo limite curto e mais conexões; `ingestion` não tem `query_timeout`, aceita esperar mais para conectar e usa poucas conexões, para a carga não competir com a requisição. Separar no preset, e não no ponto de uso, é o que impede a carga de herdar o limite da requisição por descuido.

**Junto, dois limites que faltavam.** O adaptador `paired-csv` ganha teto de cabeçalhos indexados: o índice é o preço de agrupar itens sem carregar o arquivo inteiro, e crescia sem limite com o número de pedidos. Com teto, a carga grande demais é recusada com motivo em vez de derrubar o processo. E o ESLint passa a usar regras com tipo em `src`, onde a proibição de ponto flutuante para dinheiro precisa de apoio da ferramenta; nos testes elas rendem só ruído do `node:test`, que devolve promessa em toda chamada.

## Alternativas consideradas

Notação por campo individual no mapa: descartada por enquanto, resolve o mesmo caso com mais superfície de configuração. Converter centavos por heurística de nome de campo (`_centavos`): descartada, adivinhar semântica por sufixo é o oposto de contrato explícito. Um pool só com tempo limite maior: descartada, atrasaria `/ready` e o `healthcheck`. Teto de memória resolvido com staging em banco: adiado, exige P1-02 e o teto já troca falha por recusa explicável.

## Consumidores e pendências

P1-04 cria o pool de ingestão ao expor o endpoint de carga. A Parte 2 declara os perfis de Gama e Delta com a notação mista, que agora é exprimível — há teste com a notação real do Gama, sobre um perfil sintético, provando isso antes de a Parte 2 começar.

Pendências: o teto de cabeçalhos é constante do adaptador, não configuração de ambiente; quando a ingestão tiver endpoint, decidir se vira parâmetro da carga. Staging de cabeçalhos em banco continua sendo a saída para volumes acima do teto.
