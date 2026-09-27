# Enunciado do desafio — referência

Transcrição fiel do enunciado, para consulta sem depender de acesso externo. Fonte: [CASE.pdf](CASE.pdf) neste repositório, exportado de [Desafio V360 — Conector de Pedidos de Compra](https://docs.google.com/document/d/1nbIIEDPKxx83hPHnd5P6ddwY1ukQUvWurQCrrNgv3f8/edit). Todos os nomes e dados do enunciado são fictícios; não há dado real de cliente aqui.

Este arquivo registra **o que o desafio pede**. O planejamento está em [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md) e as escolhas em [decisions/](decisions/README.md); não duplicar decisão aqui.

## Problema

Cada cliente expõe pedidos de compra em um sistema e formato diferentes. A plataforma V360 não pode conhecer o formato de cada cliente: se conhecesse, cada contrato novo viraria alteração de produto e a mudança no sistema de um cliente quebraria a plataforma para todos. Nossa camada fica no meio — busca no formato de cada cliente e entrega um contrato único, igual para todos. Não é necessário conhecimento de SAP.

Contexto de negócio: a empresa emite um pedido de compra (o combinado, item por item, com material, quantidade e preço acordado); o fornecedor entrega e emite notas fiscais; antes de pagar, alguém confere se a nota corresponde ao pedido — material igual, quantidade dentro do que ainda falta receber, preço acordado. É esse trabalho manual que a V360 elimina.

## Missão — serviço backend com API REST

Ingerir os dados de pedidos dos clientes, normalizar para um modelo único (que nós desenhamos) e atender:

1. **Consultar pedidos de todos os clientes em formato único**, com filtros úteis para quem opera: por cliente de origem, por fornecedor, por situação do pedido, e apenas os que ainda têm algo a receber. Mais o **detalhe de um pedido específico**, com o que já foi recebido e o que ainda falta em cada item. Um cliente de porte médio tem dezenas de milhares de pedidos em aberto, e a plataforma varre esse conjunto em lote, de madrugada, enquanto novas cargas continuam entrando.
2. **Conferir uma nota fiscal contra um pedido.** A plataforma envia os dados da nota que chegou — fornecedor e, para cada item, material, quantidade e valor total — e o serviço responde se está conforme o pedido. Se não estiver, precisa dizer exatamente o que não bate, de forma que a plataforma mostre ao usuário sem adivinhar nada.
3. **Relatório das conferências feitas:** quantas notas passaram, quantas travaram e por quais motivos.

São **decisões nossas, e fazem parte da avaliação**: como os requisitos viram endpoints, quais campos o modelo único tem, quais tipos de divergência existem, como as respostas são estruturadas e qual a forma de ingestão (endpoint de upload, script de carga, leitura no start da aplicação — o que fizer sentido).

As regras da conferência não existem como especificação técnica: saem do entendimento do negócio. Em caso de dúvida sobre uma regra, decidir, registrar no README por que e estar pronto para defender.

## Duas exigências não opcionais

**1. Os dados têm que viver em um banco de dados.**

- Qual banco é escolha nossa, relacional ou não, e a escolha faz parte da avaliação.
- Pedidos normalizados **e** histórico de conferências precisam sobreviver a uma parada do serviço: subir de novo não pode perder o que foi carregado nem o que foi conferido.
- A modelagem é nossa: como pedido e itens são guardados, o que identifica um pedido de forma única (o mesmo número de pedido pode existir em clientes diferentes) e quais índices sustentam as consultas do requisito 1.
- Registrar no README o que acontece quando um cliente **reenvia um pedido que mudou** — por exemplo, a quantidade já recebida de um item aumentou desde a última carga.
- Precisa subir com um comando: `docker compose up` (ou equivalente) levantando serviço e banco juntos, sem instalar banco na máquina do avaliador.

**2. Toda interface que devolve lista tem que ser paginada.**

- Vale para a consulta de pedidos e para o relatório de conferências.
- A estratégia é nossa — página/tamanho, deslocamento/limite, cursor — e defendemos a escolha.
- A resposta precisa entregar onde a plataforma está, se ainda existe coisa para buscar e como pedir o próximo pedaço.
- Paginação conviver com os filtros do requisito 1 é o uso normal, não a exceção.
- Definir tamanho de página padrão e teto máximo.

## Parte 1 — Alfa e Beta

**Alfa Energia** expõe JSON com os itens aninhados dentro do pedido: [`tests/fixtures/alfa/purchase-orders.json`](../tests/fixtures/alfa/purchase-orders.json). Campos: `purchase_orders[]` com `po_number`, `created_at` (ISO), `status`, `currency`, `vendor.tax_id` (CNPJ sem máscara), `vendor.name` e `items[]` com `line`, `material`, `description`, `uom`, `quantity_ordered`, `quantity_received`, `unit_price`. O `status` do pedido pode ser `open`, `closed` (já encerrado) ou `blocked` (bloqueado pelo cliente).

**Beta Alimentos** só consegue exportar CSV separado por ponto e vírgula, no padrão brasileiro, em **dois arquivos** ligados pelo número do pedido: [`tests/fixtures/beta/cabecalho.csv`](../tests/fixtures/beta/cabecalho.csv) (`NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA`) e [`tests/fixtures/beta/itens.csv`](../tests/fixtures/beta/itens.csv) (`NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO`). CNPJ com máscara, data `dd/mm/aaaa`, decimal com vírgula e milhar com ponto, situação em português (`EM ABERTO`, `BLOQUEADO`).

Os dois clientes falam do mesmo conceito e discordam em quase tudo: estrutura dos arquivos, nomes de campos, idioma, formato de data, formato de número, máscara de CNPJ e vocabulário de situação. Unificar isso é parte do desafio. Os exemplos são **amostras**: o serviço deve funcionar para qualquer volume nesses formatos.

Ao concluir a Parte 1, fazer um commit ou tag marcando o ponto (`git tag parte-1`). Isso é importante para a avaliação da Parte 2.

## Parte 2 — Gama e Delta

Os dois clientes entram com a Parte 1 já fechada; os três requisitos continuam valendo, agora para quatro clientes.

**Gama Logística** — sistema mais antigo, tudo achatado, uma linha por item: [`tests/fixtures/gama/purchase-order-lines.json`](../tests/fixtures/gama/purchase-order-lines.json).

- Não existe cabeçalho de pedido: os dados do pedido se repetem em cada linha de item.
- Datas como timestamp Unix em segundos (`dt_criacao`).
- Valores em centavos (`preco_unit_centavos`).
- Situação como código numérico: `1` = em aberto, `2` = encerrado, `3` = bloqueado.
- Quantidade e preço na unidade de compra, que pode ser caixa (`CX`), com o fator em `fator_conv`. No exemplo, o item 1 de `GL-778` são 10 caixas de 12 unidades a R$ 1.200,00 a caixa. **As notas fiscais dos fornecedores sempre informam quantidade em unidades, nunca em caixas.**

**Delta Distribuição** — mesmos nomes de campo do Alfa (é o mesmo produto de mercado, em outra versão); o que muda é a entrega, em duas consultas independentes ligadas pelo campo `purchase_order` de cada item: [`tests/fixtures/delta/orders.json`](../tests/fixtures/delta/orders.json) e [`tests/fixtures/delta/items.json`](../tests/fixtures/delta/items.json).

- Montar o pedido completo é trabalho do consumidor: juntamos cada item ao seu cabeçalho por `purchase_order`.
- Cada item traz o seu próprio `created_at`: a data em que aquela linha foi criada, que pode ser posterior à do cabeçalho quando o item foi incluído depois.
- As duas consultas são independentes e **não há garantia de que retratem o mesmo instante**: uma pode conhecer um pedido que a outra ainda não conhece. Decidir o que o serviço faz quando os dois lados não se encontram, registrar no README por que e estar pronto para defender.

No README, contar o que precisou mudar para cada um entrar: o que foi só adicionar e o que exigiu mexer no que já existia — incluindo o que aconteceu com o banco (precisou de migração? o modelo aguentou?).

## O README é artefato avaliado

O enunciado cobra explicitamente no README: a justificativa de cada regra de conferência decidida por nós; a política de **reenvio** de pedido alterado; a decisão sobre os dois lados do **Delta** que não se encontram; e, na Parte 2, o que foi adicionar vs. o que exigiu mudar, incluindo migrações. Decisão detalhada mora em [decisions/](decisions/README.md), mas o README precisa carregar ou linkar a defesa.

## O que o enunciado não fecha

Pontos que exigem decisão registrada; nenhum deles é dedutível do texto.

1. **Situação "encerrado" do Beta:** as amostras trazem só `EM ABERTO` e `BLOQUEADO`. O termo para encerrado não aparece — é suposição nossa, junto com o que fazer diante de um valor desconhecido.
2. **Encoding e fim de linha do CSV do Beta:** não especificados. As fixtures estão em UTF-8 com LF; exportação de ERP brasileiro costuma vir em Windows-1252 com CRLF. O parser precisa tolerar as duas coisas, e uma fixture de variante deveria provar isso.
3. **Identificação do cliente de origem:** o filtro por cliente é exigido, mas nenhum formato traz um identificador de cliente. Ele vem da ingestão, e o modelo precisa dele para a identidade do pedido.
4. **Forma e transporte da ingestão:** livres por escrito. Nada indica se os dados chegam por arquivo, upload ou consulta HTTP ao sistema do cliente.
5. **Decimal a partir de JSON:** `unit_price` do Alfa e do Delta é número JSON (`45.9`, `8.2`); `JSON.parse` produz ponto flutuante. Precisa de decisão sobre como preservar o valor exato.
6. **Preço unitário periódico no Gama:** sem moeda no payload (hipótese BRL a registrar) e, convertendo caixa para unidade, `TRP-09` dá R$ 100,00 ÷ 3 = R$ 33,3333... Não há preço unitário exato para persistir.
7. **Nota fiscal:** o enunciado define o conteúdo (fornecedor; por item material, quantidade e valor total) e não a forma. Não há amostra de nota no enunciado.
8. **Política de reenvio** e **política do Delta sem correspondência:** exigidas, não definidas.
9. **Não é pedido:** autenticação, autorização, controle de acesso por cliente, SLA, métricas ou fila. Não inventar escopo.

A avaliação inclui defender as decisões oralmente ("esteja pronto para defender"), então o motivo registrado vale mais que volume de documentação.

## Nota sobre a fonte

`CASE.pdf` é impressão de navegador sem tags. A extração de texto troca `/` por `∕` (U+2215) nas máscaras de CNPJ e nas datas, rotula os blocos de código como `None`/`JSON` e quebra linhas dentro de strings. As fixtures deste repositório foram escritas pela intenção do enunciado, com `/` correto; não copiar da extração.
