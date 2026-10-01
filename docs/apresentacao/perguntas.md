# As dez perguntas, respondidas

Material de estudo para a apresentação. O e-mail do processo lista dez coisas que você precisa saber explicar; cada seção aqui tem a **resposta curta** (a frase que basta se você só lembrar de uma), o **raciocínio**, e **onde olhar** no repositório.

Duas regras para a conversa:

- Toda afirmação tem um número ou um arquivo atrás. Se te perguntarem "como você sabe?", a resposta é um comando, não uma opinião.
- Quando você não souber, diga que não sabe e diga o que faria para descobrir. Isso conta mais do que improvisar.

---

## 1 · O problema de negócio

**Resposta curta.** Uma empresa emite um pedido de compra — o combinado, item por item, com material, quantidade e preço. O fornecedor entrega e manda a nota fiscal. Antes de pagar, alguém confere se a nota corresponde ao pedido: material igual, quantidade dentro do que ainda falta receber, preço acordado. Esse trabalho é manual, e é ele que o serviço elimina.

**Por que a conferência existe.** Três coisas podem dar errado e todas custam dinheiro. O fornecedor cobra por material que não estava no pedido. Cobra quantidade maior do que o saldo — por exemplo, entrega duas vezes a mesma remessa. Ou cobra preço diferente do acordado. Sem conferência, qualquer uma dessas passa para o contas a pagar.

**O que resolvo para quem opera.** Duas coisas, e vale separar:

- **Antes:** ver os pedidos de todos os clientes num formato só. Hoje cada cliente exporta de um jeito, então quem opera precisa saber ler quatro formatos. Passa a ler um.
- **No momento da conferência:** receber não um "sim/não", mas **exatamente o que não bate**, com código estruturado. A plataforma mostra ao usuário sem adivinhar, e o usuário sabe o que cobrar do fornecedor.

**O detalhe que mostra entendimento do negócio.** Conferir **não consome saldo**. É um julgamento registrado, não uma baixa de recebimento. Se consumisse, conferir duas vezes a mesma nota mudaria o saldo — e conferência é consulta sobre um fato, não o fato.

---

## 2 · Arquitetura e a integração de cada cliente

**Resposta curta.** O eixo de variação é a **forma de entrega**, não o cliente. Quatro adaptadores, e um **perfil** por cliente que declara em dados tudo o que varia.

**Por que não um módulo por cliente.** Porque aí cada contrato novo é alteração de produto, e a mudança no ERP de um cliente entra no caminho de código de todos. O enunciado diz isso com outras palavras: a plataforma não pode conhecer o formato de cada cliente.

**O que o perfil declara:** qual adaptador, onde cada campo do contrato mora no vocabulário do cliente (inclusive caminho aninhado, `vendor.tax_id`), formato de data, notação numérica **por campo**, vocabulário de situação, máscara de documento, política de checksum e moeda assumida.

**A prova de que o eixo está certo.** Quatro adaptadores atendem **cinco** perfis: `beta-erp` é o mesmo cliente de negócio exportando em Windows-1252, e entrou como perfil, não como código. E Gama e Delta entraram na Parte 2 **sem mudar uma coluna** do banco.

**Onde o perfil não alcança** — diga isto antes que te perguntem, mostra que você conhece o limite:

- `dateFormat` e `numberFormat` são enums fechados (`iso-date | br-date | unix-seconds`, `plain | br | cents`). Formato fora deles exige estender o enum e o parser.
- O perfil **mapeia, não calcula**. "A situação é `aberto` quando falta receber" é derivação, e exige código.
- Estrutura fora do molde — um array de pedidos, cada um com um array de itens — é forma de entrega nova.

**Onde olhar:** `src/infrastructure/integrations/client-profiles.ts`, `src/domain/client.ts` (o tipo `ClientProfile`), ADR-008.

---

## 3 · Modelo único, endpoints e divergências

**O modelo.** Pedido com `clientId`, `externalNumber`, fornecedor (CNPJ + razão social), moeda, situação em três valores (`aberto`, `encerrado`, `bloqueado`), data de emissão, versão de ingestão e um booleano de saldo pendente. Item com linha externa, material, descrição, unidade de compra, fator de conversão, quantidade pedida, recebida, pendente, preço unitário e data própria da linha.

**Os endpoints, e por que cada um:**

| Rota                                  | Requisito                                    |
| ------------------------------------- | -------------------------------------------- |
| `POST /clients/{clientId}/ingestions` | ingestão — forma era decisão nossa           |
| `GET /purchase-orders`                | requisito 1, consulta unificada com filtros  |
| `GET /purchase-orders/{id}`           | requisito 1, detalhe com recebido e pendente |
| `POST /conferences`                   | requisito 2                                  |
| `GET /conferences/summary`            | requisito 3, quantas passaram e por quê      |
| `GET /conferences`                    | histórico paginado e filtrável               |
| `GET /health`, `GET /ready`           | operação                                     |

`POST /conferences` responde **201** porque a conferência **cria** um registro no histórico — não é consulta, é fato novo que sobrevive à parada do serviço.

**As sete divergências:**

| Código                      | Quando                                            |
| --------------------------- | ------------------------------------------------- |
| `FORNECEDOR_DIVERGENTE`     | o CNPJ da nota não é o do pedido                  |
| `PEDIDO_NAO_ABERTO`         | pedido encerrado ou bloqueado                     |
| `MATERIAL_NAO_ENCONTRADO`   | material da nota não está no pedido               |
| `MATERIAL_AMBIGUO`          | o material aparece em mais de uma linha do pedido |
| `QUANTIDADE_NAO_POSITIVA`   | quantidade zero ou negativa na nota               |
| `QUANTIDADE_ACIMA_DO_SALDO` | passa do que ainda falta receber                  |
| `VALOR_TOTAL_DIVERGENTE`    | valor da linha ≠ quantidade × preço acordado      |

**Três decisões para defender:**

1. **A taxonomia é fechada.** Código novo é mudança de contrato consciente, não string inventada no handler. A plataforma decide por código, não interpretando texto.
2. **Devolvemos todas as divergências**, não a primeira. Quem opera precisa ver tudo de uma vez para cobrar o fornecedor uma vez.
3. **`MATERIAL_AMBIGUO` existe de propósito.** Se o mesmo material está em duas linhas do pedido, não há como saber a qual a nota se refere — e escolher uma seria inventar. Recusar é mais honesto que adivinhar.

**Onde olhar:** `src/domain/conference-rules.ts` (uma regra por bloco, na ordem), ADR-009.

---

## 4 · O banco

**Identidade.** A chave externa é o par `(clientId, externalNumber)`, com `@@unique`. O enunciado cobra isso: o mesmo número de pedido existe em clientes diferentes. O `id` interno é UUID v7 e é nosso.

**Por que UUID v7 e não serial.** Porque a paginação por cursor depende de **monotonicidade**: uma linha inserida durante a varredura precisa receber um id maior que a posição atual e ir para o fim, em vez de cair antes dela e nunca ser vista. Serial também seria monotônico, mas expõe volume e cria ponto de contenção; UUID v4 quebraria a varredura **em silêncio** — e há um teste que falha se alguém trocar a versão no schema.

**Item.** `@@unique([purchaseOrderId, externalLine])` — a linha é única dentro do pedido. E `@@index([purchaseOrderId, material])`, porque a conferência busca por material.

**Os índices do pedido, e o porquê de cada um:**

| Índice                                     | Para qual consulta                    |
| ------------------------------------------ | ------------------------------------- |
| `(clientId, id)`                           | filtro por cliente + cursor           |
| `(clientId, status, id)`                   | cliente + situação                    |
| `(supplierTaxId, id)`                      | filtro por fornecedor                 |
| `(externalNumber, id)`                     | achar um pedido pelo número           |
| `(clientId, id) WHERE has_pending_balance` | **parcial** — a varredura noturna     |
| `(id) WHERE has_pending_balance`           | saldo pendente sem recorte de cliente |

**Por que `(clientId, status, id)` não substitui `(clientId, id)`:** com o status no meio, uma consulta "cliente sem filtro de situação" não consegue ordenar direto por `id` — a ordenação sairia por `status` primeiro. São duas consultas diferentes.

**Por que os dois índices parciais.** A consulta mais importante do enunciado é "apenas os que ainda têm algo a receber". Um índice parcial cobre só as linhas que interessam e **encolhe com o tempo**, em vez de crescer junto com o histórico de pedidos encerrados.

**Por que `has_pending_balance` é persistido e não calculado.** Comparar duas colunas (`pedida > recebida`) não usa índice B-tree. Persistir o booleano é o que permite o índice parcial.

**Caminhos não indexados, de propósito:** filtrar só por situação, ou só por fornecedor com saldo, sobre todos os clientes. Não são a varredura que o enunciado descreve, e cada índice custa escrita em toda ingestão.

**O que acontece no reenvio.** O retrato é **substituído** numa transação: preserva a identidade interna, incrementa `ingestionVersion` e recalcula o saldo. Cada conferência guarda a versão que conferiu, para uma recarga posterior não mudar o sentido de uma conferência antiga.

E a distinção que parece detalhe e não é: `items: null` significa "esta carga não trouxe os itens" e **preserva** os conhecidos; `items: []` significa "o cliente afirma que não há itens" e **remove**. Confundir as duas já causou perda de dado neste projeto.

**Concorrência.** Duas cargas do mesmo pedido são serializadas por `pg_advisory_xact_lock(hashtext('cliente:numero'))`. Por que não `SELECT FOR UPDATE`: ele tranca uma linha que existe, e o caso difícil é o pedido que **ainda não existe** — não há linha para trancar, e as duas transações decidem criar.

**Dez `CHECK` no banco.** A aplicação já valida, mas validação só na aplicação some com um `psql`.

---

## 5 · Paginação

**A escolha: cursor.** Padrão 50, teto 100, e `limit` acima do teto é **recusado com 400**, não recortado em silêncio.

**Por que não `OFFSET`.** Dois motivos, e o segundo é o que importa:

1. Fica mais caro a cada página — o banco precisa contar e descartar as linhas anteriores.
2. **Pula e repete** quando o conjunto muda no meio: uma inserção antes da posição atual desloca tudo o que vem depois.

**O que garante não repetir nem pular** — esta é a pergunta, e tem duas partes:

- **Não pular:** o id é UUID v7, ordenável no tempo. Uma linha inserida durante a varredura recebe id maior que a posição atual e vai para o fim da fila, não para antes dela.
- **Não repetir, e terminar:** o cursor carrega o **teto** da varredura, fixado na primeira página. A varredura é um **retrato**: o que entrar depois fica para a próxima. Sem o teto, uma leitura sob escrita contínua persegue o que entra e não tem condição própria de término.

**Como combina com os filtros.** O cursor carrega uma **impressão dos filtros**. Trocar um filtro no meio da varredura é recusado com `cursor_invalido`, em vez de devolver em silêncio uma página de outro conjunto.

**A medição, se te pedirem prova.** `npm run validate:sweep` varre 20.000 pedidos com um escritor concorrente **ainda ativo depois do fim**, afirmando zero repetidos. E a última faixa de páginas custa cerca de metade da primeira — o que distingue cursor de `OFFSET` por número, não por argumento.

**Onde olhar:** `src/infrastructure/database/cursor.ts`, ADR-010.

---

## 6 · Regras de negócio: normalização e tolerância

**Datas.** Três formatos de entrada (`iso-date`, `br-date`, `unix-seconds`) convergem para `YYYY-MM-DD`. O cuidado: a API de data do JavaScript opera em **fuso local** por padrão, e `2026-08-15T00:00:00Z` formatado em `pt-BR` dá `14/08/2026`. Tudo é UTC explícito, e `new Date` acomodando 31/02 como 03/03 é recusado comparando de volta.

**Valores.** Decimal viaja como **texto** do arquivo à resposta. Duas escalas de propósito: 12 casas para cálculo, 6 para o que é persistido (`NUMERIC(30,6)`). Valor com mais casas do que a coluna guarda é **rejeitado**, não arredondado — arredondar silenciosamente é o que fazia `0.0000001` virar `0.000000`.

**Unidades.** O pedido é guardado **como o cliente o emitiu**: quantidade e preço na unidade de compra, com o fator ao lado. A conversão acontece na conferência. Converter na ingestão perderia o dado original.

**Situações.** Vocabulário canônico de três valores, e a tradução é **allowlist por perfil**. Valor fora do mapa é **rejeitado**, não interpretado — o enunciado nem diz qual é o termo do Beta para "encerrado".

### Onde sou tolerante, e onde não

Esta é a parte que diferencia a resposta. A regra geral: **tolerante na forma, intolerante na semântica.**

| Tolerante                                                         | Intolerante                                       |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| encoding do CSV (UTF-8 e Windows-1252) e fim de linha (LF e CRLF) | situação fora do vocabulário → recusa o registro  |
| ordem das linhas no arquivo                                       | decimal com mais casas que a coluna → recusa      |
| itens que chegam antes do cabeçalho → esperam                     | CNPJ com caractere a mais → recusa                |
| um registro inválido não derruba a carga: o resto entra           | moeda fora da allowlist → recusa                  |
| a **nota** é laxa: quantidade zero vira divergência, não 400      | o **pedido** é estrito: fator zero recusa a linha |

As duas últimas linhas merecem explicação, porque parecem contradição e não são. A **nota é uma afirmação sobre o mundo que nós julgamos**; o **pedido é um registro que guardamos**. Barrar quantidade zero na entrada da nota devolveria 400 e tornaria o código `QUANTIDADE_NAO_POSITIVA` inalcançável — a plataforma perderia a informação de _por que_ a nota travou.

**Um caso concreto para contar.** O checksum de CNPJ: eu quis adotar, e descobrimos que **nenhum dos sete CNPJs do enunciado passa** — são fictícios. Ligar como obrigatório rejeitaria toda a amostra. Virou política por perfil, desligada por padrão, pronta para um cliente com dado real (ADR-013).

---

## 7 · A montagem do pedido do Delta

Esta é a parte mais difícil do projeto. Dez ciclos de revisão passaram por aqui.

**Como junto as duas consultas.** Por `purchase_order` de cada item. O enunciado avisa que as duas consultas **não têm garantia de retratar o mesmo instante**, então os dois descasamentos possíveis precisam de política.

**Item que aponta para um pedido que não recebi.** Não vira pedido inventado — isso fabricaria fornecedor, situação e data que ninguém afirmou, e um pedido sem situação nunca poderia ser conferido. Também não é descartado. Ele **fica esperando**, numa tabela de espera, e entra no pedido quando o cabeçalho chegar — mesmo que seja em **outra requisição, horas depois**. Guardar em memória não resolveria por isso.

**Pedido que chegou sem item nenhum.** É pedido legítimo: `itemCount: 0`, sem saldo pendente. No Delta é o caso do `DL-2026-0046`. Não confundir com `items: null`, que é "esta carga não trouxe os itens".

**A data que vem em cada item.** O Delta é o único cliente em que a linha tem `created_at` própria, que pode ser posterior à do cabeçalho quando o item foi incluído depois. Ela é persistida por item, em `lineCreatedOn`. Nos outros clientes é `null`.

Um detalhe que vale saber: no **Gama**, `dt_criacao` se repete em cada linha porque no formato achatado é o cabeçalho que se repete — então ela é a data do **pedido**, e `lineCreatedOn` fica nulo. E se duas linhas do mesmo pedido Gama trouxerem datas diferentes, o pedido inteiro é **recusado** com motivo explícito, em vez de eleger uma. Nenhuma data é descartada em silêncio.

**O que faz a espera funcionar** — três invariantes, cada um fechou um defeito real:

1. A linha nasce **não publicada**, invisível para outras cargas, e é publicada na **mesma transação** que a contabiliza no relatório. Sem isso, um cabeçalho concorrente consumia o prefixo de uma carga que depois recusaria o pedido inteiro.
2. A identidade física da espera inclui o **identificador da carga**. Sem isso, duas cargas simultâneas do mesmo pedido consumiam uma a espera da outra.
3. **Carga terminada não deixa linha não publicada.** Note a forma: não é "verifique se sobrou", é "é impossível sobrar" — e se sobrar, o relatório diz.

O terceiro encerrou a sequência de defeitos. Se te perguntarem o que você aprendeu no projeto, essa é a resposta: as correções que funcionaram foram as que tornaram o erro **impossível por construção**, não vigiado.

---

## 8 · Parte 1 → Parte 2, e o quinto cliente

**O que foi só adicionar.** Dois adaptadores (`flat-json`, `split-json`) e dois perfis. Zero mudança no contrato normalizado, zero coluna nova por causa de formato de cliente.

**O que exigiu mexer no que já existia** — e aqui está a honestidade que conta:

1. **Uma migração**, `0002_staging_de_itens_orfaos`. Mas ela **não** foi para acomodar formato de cliente: ela fechou uma promessa do ADR-008 — reconciliar o item que chega antes do cabeçalho — que estava escrita e não implementada. O Delta expôs a lacuna, não a criou.
2. **Notação numérica virou por campo.** O Gama tem quantidade em inteiro simples e preço em centavos **na mesma linha**. Com um `numberFormat` só por cliente, a conversão de centavos comeria a quantidade. Está em ADR-012.
3. **Moeda assumida.** O payload do Gama não traz moeda. Antes, ausência era rejeição; passou a ser declarável no perfil — e continua rejeição para quem não declara.

### Se um quinto cliente chegar hoje

**Caso A — formato já conhecido.** Só perfil. Cerca de 15 linhas de dados em `client-profiles.ts`:

```ts
{
  clientId: 'omega',
  deliveryFormat: 'nested-json',   // reaproveita o adaptador do Alfa
  formatVersion: '1',
  dateFormat: 'unix-seconds',
  numberFormat: { quantity: 'plain', money: 'cents' },
  taxIdMasked: true,
  statusVocabulary: { '1': 'aberto', '2': 'encerrado', '3': 'bloqueado' },
  fields: { /* onde cada campo mora no vocabulário dele */ },
}
```

Nenhuma linha de lógica. Há um teste que prova exatamente isso: _"cliente novo em forma conhecida entra só com perfil, sem código novo"_.

**Caso B — formato novo, por exemplo XML.** Um adaptador novo, e o trabalho é só este:

1. **Escolher a biblioteca de leitura em fluxo.** Não `DOMParser`: XML de dezenas de milhares de pedidos não cabe em memória. Seria `sax` ou `saxes` — e entraria com ADR, porque a regra do projeto é não instalar dependência sem necessidade documentada.
2. **Implementar `SourceAdapter`**: `checkStructure` (a passagem que confere se o documento termina, antes de gravar) e `read` (gerador de lotes).
3. **Reaproveitar tudo o que não é estrutura**: `record-mapping.ts` e `field-parsers.ts` já fazem data, número, CNPJ, situação e validação contra o contrato. O adaptador novo só decide _como percorrer o documento_.
4. **Registrar no `adapter-registry.ts`** e acrescentar `'xml'` ao tipo `DeliveryFormat` — aí o TypeScript aponta todos os lugares que precisam saber.
5. **Nomes de parte** na allowlist da rota.

**Estimativa honesta:** o `paired-csv` tem ~310 linhas e é o mais complexo, porque indexa cabeçalhos e percorre itens em fluxo. Um adaptador XML ficaria nessa ordem. O que **não** muda: contrato, banco, rotas, regras de conferência, paginação.

**E se o XML trouxer um formato de data novo?** Aí também estende o enum `DateFormat` e o parser — que é o limite do perfil que eu mencionei na pergunta 2.

---

## 9 · Como usei IA

A resposta completa está em [`AI_USAGE.md`](../../AI_USAGE.md). O essencial para a conversa:

**A decisão estrutural:** duas assistentes com papéis separados — uma implementa, outra revisa de forma independente, sem acesso à conversa em que o código nasceu. Pedir revisão a quem escreveu produz concordância, não revisão. Isso gerou 19 ciclos de revisão e 19 correções.

**O que aceitei como veio:** o eixo de variação por forma de entrega. Sustentou-se sob pressão — Gama e Delta entraram sem mudar coluna.

**O que reescrevi, e por quê:** a notação numérica única (quebraria o Gama), e o checksum de CNPJ como obrigatório (reprovaria as sete amostras do enunciado).

**Onde a IA errou** — tenha um exemplo na ponta da língua: ela escreveu um teste de regressão que **afirmava o comportamento errado** que o próprio achado descrevia. Percebi lendo o teste e perguntando "se isto passar, o que eu provei?". A resposta era "provei que o bug existe". Disso virou prática: toda guarda deste repositório foi quebrada de propósito para ver o teste ficar vermelho.

**Como garanti que entendo:** reproduzir cada achado com uma sonda antes de corrigir; verificar contra o serviço real e não contra o teste; exigir medição em vez de argumento.

---

## 10 · Trade-offs e melhorias

**Os trade-offs que eu assumiria na conversa:**

| Escolha                          | O que ganhei                          | O que paguei                                                                           |
| -------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| Carga síncrona                   | contrato simples, recibo imediato     | 50.000 pedidos = requisição de 3,2 min; um balanceador com tempo limite padrão derruba |
| Perfil em código                 | validado no start, tipado             | cliente novo exige reimplantar                                                         |
| Decimal como texto               | exatidão ponta a ponta                | quem consome precisa de biblioteca decimal, não pode `JSON.parse` e somar              |
| `has_pending_balance` persistido | índice parcial funciona               | mais um campo a manter coerente na escrita                                             |
| Índices escolhidos               | as consultas do enunciado são rápidas | cada índice custa escrita em toda ingestão                                             |
| Cursor em vez de offset          | varredura termina e não repete        | não dá para pular para a página 50                                                     |

**As melhorias, por ordem do que eu faria primeiro:**

1. **Ingestão assíncrona** com acompanhamento e retomada. É o trade-off mais incômodo.
2. **Autenticação**, e o `clientId` derivado da identidade autenticada em vez de afirmado no caminho da URL.
3. **Perfis em banco**, versionados.
4. **Separar credencial de DDL e de DML.**
5. **`GET /metrics`** — está desenhado em ADR-005 e não implementado, por decisão de não instalar dependência de observabilidade sem ambiente onde ela seja lida.
6. **Rota composta de detalhe**, `GET /clients/{clientId}/purchase-orders/{externalNumber}`, para não exigir duas requisições de quem só sabe o número.

**O que não implementei por não ser pedido** — e vale dizer explicitamente, porque mostra controle de escopo: autenticação, autorização, controle de acesso por cliente, SLA, métricas e fila.

---

## Se te pedirem para rodar algo

```sh
docker compose up -d
node scripts/validate-case.mjs    # 30 asserções, uma por exigência do enunciado
npm run audit:fidelity            # 156 campos: o arquivo de entrada contra o banco
```

A primeira é a mais forte: é a lista do enunciado virando teste executável.

E o documento que eu escrevi para entender o projeto é [`HARD-PARTS.md`](../HARD-PARTS.md) — treze problemas, cada um com o problema, por que a resposta óbvia falha, a decisão e a prova.
