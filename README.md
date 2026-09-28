# V360 — Conector de Pedidos de Compra

Cada cliente expõe pedidos de compra em um sistema e formato diferente. Este serviço fica no meio: lê o formato de cada um, normaliza para um contrato único e responde três perguntas — **quais pedidos existem**, **esta nota fiscal bate com o pedido** e **como foram as conferências**.

Desafio [Case — Engenheiro SAP Junior](https://docs.google.com/document/d/1nbIIEDPKxx83hPHnd5P6ddwY1ukQUvWurQCrrNgv3f8/edit), transcrito em [docs/CASE.md](docs/CASE.md). Amostras dos quatro clientes em [tests/fixtures/](tests/fixtures/README.md).

**Os quatro clientes estão integrados e validados.** A Parte 1 (Alfa e Beta) está marcada na tag `parte-1`; Gama e Delta entraram na Parte 2.

## Executar

```sh
docker compose up
```

Sobe PostgreSQL 17, aplica a migração como etapa própria e só então inicia a API — `/ready` responde 200 quando a migração esperada está aplicada, não apenas quando o banco aceita conexão. A API atende em `http://localhost:3000`; o banco é publicado no host em `55432` para nunca disputar a porta de um PostgreSQL já instalado. `npm run up` roda antes uma verificação de portas e daemon que **aborta sem tocar em nada** se houver conflito.

Carregar as amostras e exercitar tudo:

```sh
node scripts/validate-case.mjs    # 27 asserções, uma por exigência do enunciado
```

Desenvolvimento local: `cp .env.example .env && npm ci && npm run db:up && npm run dev`. `npm run check` roda geração do cliente Prisma, tipagem, lint, formatação, a suíte completa e o build, **sem exigir banco**; `npm run test:integration` roda o que exige PostgreSQL real. O contrato completo das rotas está em [docs/API.md](docs/API.md).

---

# As decisões, e por que

O enunciado é explícito: as regras de conferência não existem como especificação, saem do entendimento do negócio, e precisam ser defendidas. O que segue é a defesa; o registro detalhado de cada uma está em [docs/decisions/](docs/decisions/README.md).

## As regras de conferência

A plataforma manda o fornecedor e, por item, material, quantidade e valor total. Conferimos **nesta ordem** ([ADR-009](docs/decisions/ADR-009-conferencia.md)):

| #   | Regra                                                    | Código da divergência       |
| --- | -------------------------------------------------------- | --------------------------- |
| 1   | fornecedor da nota é o do pedido                         | `FORNECEDOR_DIVERGENTE`     |
| 2   | pedido está `aberto` — encerrado ou bloqueado não recebe | `PEDIDO_NAO_ABERTO`         |
| 3   | o material existe em alguma linha do pedido              | `MATERIAL_NAO_ENCONTRADO`   |
| 4   | o material não está ambíguo entre linhas                 | `MATERIAL_AMBIGUO`          |
| 5   | a quantidade é positiva                                  | `QUANTIDADE_NAO_POSITIVA`   |
| 6   | a quantidade cabe no saldo que falta receber             | `QUANTIDADE_ACIMA_DO_SALDO` |
| 7   | o valor total bate com quantidade ÷ fator × preço        | `VALOR_TOTAL_DIVERGENTE`    |

Quatro dessas decisões não são óbvias e são as que eu defendo:

**Conferir não é receber.** A conferência não consome saldo. A quantidade recebida é dado do sistema do cliente e só muda por ingestão. Se a conferência a consumisse, o número divergiria da fonte na primeira carga seguinte, e o serviço passaria a mentir sobre o que o cliente tem — justamente o oposto do que ele existe para fazer.

**Devolvemos todas as divergências, não a primeira.** O enunciado exige que a plataforma mostre ao usuário o que não bate "sem adivinhar nada". Parar na primeira obrigaria o usuário a corrigir, reenviar e descobrir a próxima. Aprovada significa lista vazia.

**Material ambíguo é divergência, não palpite.** Se o material aparece em mais de uma linha do pedido e a nota não diz qual, devolvemos `MATERIAL_AMBIGUO` em vez de escolher. Não existe regra de alocação combinada com o cliente, e escolher errado consumiria o saldo da linha errada — um erro silencioso, que só aparece muito depois. Preferimos parar e perguntar.

**Linhas repetidas da nota são somadas antes de comparar com o saldo.** Uma nota com duas linhas de 60 do mesmo material passaria, item por item, contra um saldo de 100. Somadas, não passam.

E duas fronteiras: **pedido inexistente é `404`, não divergência** — a nota pode estar certa e o pedido simplesmente ainda não ter sido carregado; e a **taxonomia é fechada de propósito**, para a plataforma mostrar o motivo sem interpretar texto livre. Código novo é mudança de contrato, consciente.

## Política de reenvio de pedido alterado

**Retrato completo, por pedido, em uma transação.** Quando o cliente reenvia um pedido que mudou — a quantidade recebida de um item aumentou, por exemplo — o pedido é substituído inteiro: a identidade interna é preservada, `ingestionVersion` incrementa, o saldo é recalculado e o **histórico de conferências não é tocado** ([ADR-008](docs/decisions/ADR-008-ingestao.md)).

Substituir o retrato inteiro, em vez de aplicar diferenças, é a escolha central. Nenhum dos formatos informa o que mudou; deduzir a diferença exigiria confiar que a carga anterior estava completa, e uma carga parcial passaria a corromper o saldo de forma silenciosa. O retrato completo é idempotente: reenviar o mesmo arquivo duas vezes dá o mesmo resultado, o que é exatamente o que se quer de uma integração que pode reenviar por falha de rede.

Três consequências que assumo:

- **Cargas concorrentes do mesmo pedido são serializadas** por advisory lock em `(clientId, externalNumber)`. Sem isso, duas cargas simultâneas não se enxergam e a unicidade derruba uma delas. Está provado com carga concorrente real em [ENV-03](docs/handoffs/ENV-03-claude.md).
- **Prevalece a última carga aceita.** Nenhuma fonte informa versão confiável, então uma carga atrasada pode regredir o retrato. Não impedimos; registramos `ingestedAt` para que a regressão seja **detectável**, e deixamos a política registrada como pendência em vez de inventar agora um relógio em que ninguém confia.
- **O histórico guarda o que foi comparado**, inclusive a versão do pedido conferida. Sem isso, uma reingestão mudaria retroativamente o sentido do histórico e o relatório passaria a descrever outra coisa.

**Carga só de cabeçalho não apaga itens.** No contrato, `items: null` significa "esta carga não trouxe os itens" e `items: []` significa "o cliente afirma que não há itens". Sem essa distinção, uma consulta de cabeçalhos apagaria todos os itens já conhecidos.

**Aceitação parcial:** a transação é por pedido, não por carga. Um registro inválido em dez mil não derruba o lote — o resto entra e cada rejeitado volta com referência e motivo. Tudo-ou-nada, no volume que o enunciado descreve, transformaria um erro de digitação em indisponibilidade.

## Delta: os dois lados que não se encontram

O Delta entrega pedidos e itens em duas consultas independentes, sem garantia de retratarem o mesmo instante. Um lado pode conhecer um pedido que o outro ainda não conhece. Os dois casos têm respostas diferentes ([ADR-008](docs/decisions/ADR-008-ingestao.md)):

**Item sem cabeçalho vai para staging, não para pedido incompleto.** O item fica guardado com o conteúdo cru e é reconciliado quando o cabeçalho aparecer. Inventar um pedido a partir do item significaria inventar fornecedor, situação e data — e um pedido sem situação nunca poderia ser conferido, porque a regra 2 depende dela. Descartar o item obrigaria o cliente a reenviar algo que ele já mandou corretamente.

**Cabeçalho sem itens é pedido legítimo.** Ele existe no sistema do cliente; fica persistido com `hasPendingBalance: false`, aparece na consulta e não precisa de sinalização especial — uma conferência contra ele devolve `MATERIAL_NAO_ENCONTRADO` pelas regras que já existem. A assimetria é proposital: o cabeçalho é a identidade do pedido, o item não é.

**A reconciliação é automática, no próximo encontro.** O item em espera é gravado em `ingestion_staging` já normalizado, e quando o cabeçalho chega ele entra no pedido sem que ninguém reenvie a carga. Se a carga trouxer a mesma linha, a versão da carga manda e a que esperava é descartada. Item cujo cabeçalho nunca chega continua esperando, visível, em vez de virar pedido incompleto ou sumir.

## A Parte 2: o que foi adicionar e o que exigiu mudar

O enunciado cobra este relato. A resposta curta é que **o contrato normalizado absorveu os dois clientes novos sem mudar uma coluna**, e a única migração que a Parte 2 exigiu não foi para acomodar dado de cliente — foi para uma capacidade que faltava.

**Só adicionar** (nada existente foi tocado):

| O quê                                | Onde                    |
| ------------------------------------ | ----------------------- |
| adaptador de linhas achatadas (Gama) | `flat-json-adapter.ts`  |
| adaptador de duas consultas (Delta)  | `split-json-adapter.ts` |
| os dois perfis de cliente            | `client-profiles.ts`    |
| leitura de array na raiz do JSON     | `json-stream.ts`        |

As notações do Gama — timestamp Unix, centavos, situação numérica, fator de conversão por item — **já eram exprimíveis no perfil**, porque `dateFormat: 'unix-seconds'`, `money: 'cents'` e `conversionFactor` foram desenhados na Parte 1 antecipando isso. Nenhuma regra de conferência mudou.

**Exigiu mexer no que já existia:**

- **A rota tratava toda parte declarada como obrigatória.** O Delta entrega duas consultas independentes e qualquer uma pode vir sozinha, então a allowlist de partes aceitas passou a ser separada da lista de partes exigidas — que para `split-json` é vazia, de propósito.
- **O lote do adaptador passou a carregar o item já normalizado**, não só o conteúdo cru, porque quem reconcilia depois é o caso de uso, que não conhece o formato do cliente.
- **O caso de uso ganhou a orquestração da espera.** O adaptador só enxerga os cabeçalhos da carga atual, então um item de pedido que já existe no banco seria mandado para a espera em vez de atualizar o pedido. Quem sabe disso é o caso de uso, que tem o repositório.

**E dois erros meus que só o Gama tornou visíveis:**

- Eu havia convertido a quantidade para unidade de consumo **na entrada**. Estava errado e duplicaria a conversão, porque a conferência já converte o saldo pelo fator. Com fator 1 em Alfa e Beta isso era invisível; o fator 12 do Gama expôs.
- Uma linha ruim do Gama gerava **duas** recusas, a da linha e outra do grupo, contando o mesmo problema duas vezes no relatório de carga.

**O banco: uma migração, e não pelo motivo que se esperaria.**

`purchase_order` e `purchase_order_item` não mudaram — nenhuma coluna nova, nenhum tipo alterado, nenhum índice acrescentado. Quatro formatos que discordam em estrutura, idioma, formato de data, formato de número, máscara de CNPJ, unidade e vocabulário de situação couberam no mesmo modelo.

A migração `0002_staging_de_itens_orfaos` criou a tabela de espera, e é consequência da decisão do Delta, não do formato dele: o item que chega antes do cabeçalho precisa **sobreviver à carga** para ser reconciliado depois. Antes dela a promessa do ADR-008 não se cumpria — o órfão voltava no relatório e se perdia.

## Paginação: cursor, e por quê

Toda lista é paginada — consulta de pedidos e histórico de conferências. **Padrão 50, teto 100**, acima disso a requisição é recusada em vez de silenciosamente reduzida ([ADR-010](docs/decisions/ADR-010-paginacao.md)).

A estratégia é **cursor opaco**, não deslocamento. O enunciado descreve o caso de uso que decide isso: dezenas de milhares de pedidos varridos em lote, de madrugada, **enquanto novas cargas continuam entrando**. Com `OFFSET`, as duas coisas quebram — a página 500 faz o banco varrer 50.000 linhas para descartar 49.900, e uma carga que insere no meio desloca a janela, fazendo a varredura pular ou repetir pedidos. Repetir é o pior dos dois: faria reconferir nota já conferida.

O cursor carrega o **filtro** junto com a posição. Trocar de filtro no meio de uma varredura é recusado com 400, não silenciosamente aceito com um resultado que ninguém consegue interpretar.

Medido, não suposto: 50.000 pedidos em 500 páginas, **zero repetidos**, e a última página custa 0,54× a primeira ([P1-05](docs/handoffs/P1-05-claude.md)).

## O modelo único

**A identidade de um pedido é `(clientId, externalNumber)`**, não o número sozinho: o enunciado avisa que o mesmo número existe em clientes diferentes. O `clientId` vem da ingestão, no caminho da URL, e **nunca é deduzido do conteúdo** — o Delta usa os mesmos nomes de campo do Alfa, então dedução por conteúdo quebra exatamente aí ([ADR-006](docs/decisions/ADR-006-modelo-normalizado.md)).

**Um adaptador por forma de entrega, não por cliente.** São quatro formas (`nested-json`, `paired-csv`, `flat-json`, `split-json`) e N clientes. O que é estrutura é código; o que é rótulo — caminho do campo, formato de data e número, máscara de CNPJ, delimitador, encoding, vocabulário de situação — é configuração do perfil do cliente. Cliente novo numa forma conhecida é um perfil novo, sem código novo.

**Nenhum valor monetário passa por ponto flutuante.** `unit_price` do Alfa é número JSON (`45.9`) e `JSON.parse` produz float; o JSON é lido em fluxo com os números preservados **como texto**, e a aritmética é decimal exata, persistida em `NUMERIC(30,6)` ([ADR-007](docs/decisions/ADR-007-decimal-e-unidade.md)). **Nada é convertido na gravação.** Quantidade e preço ficam na unidade de compra do cliente, com o fator guardado em cada item: as 10 caixas do Gama continuam 10, e o detalhe do pedido mostra o mesmo número que o operador vê no sistema dele. A conversão para unidade de consumo acontece na **conferência**, porque é lá que a nota fiscal do fornecedor fala em unidades — o saldo de 8 caixas de fator 12 vira 96 unidades na comparação, e o valor esperado sai de `quantidade ÷ fator × preço`. Converter na gravação produziria dízima — R$ 100,00 por caixa de fator 3 são R$ 33,3333… por unidade — e arredondar ali embutiria erro permanente no dado.

## Por que PostgreSQL

Relacional, porque o problema é relacional: pedido e itens com integridade referencial, unicidade composta por cliente, transação por pedido no reenvio e conferência que não pode apagar histórico. Os filtros do requisito 1 são sustentados por **índices parciais** (`WHERE has_pending_balance`), confirmados por `EXPLAIN` e não supostos ([ADR-001](docs/decisions/ADR-001-postgresql.md), [ENV-03](docs/handoffs/ENV-03-claude.md)).

As demais escolhas: [TypeScript e Node](docs/decisions/ADR-002-typescript-nodejs.md), [Fastify](docs/decisions/ADR-003-fastify.md), [Prisma 7](docs/decisions/ADR-004-prisma-7.md) e as [bibliotecas](docs/decisions/ADR-011-bibliotecas-p1-03.md).

---

## Como isto está validado

| O quê                       | Como                                                                      |
| --------------------------- | ------------------------------------------------------------------------- |
| cada exigência do enunciado | `scripts/validate-case.mjs` — uma asserção por exigência, **27/27** no ar |
| domínio, adaptadores, rotas | `npm run check` — a suíte completa, sem exigir banco                      |
| transação, locks, índices   | `npm run test:integration` — 16 testes contra PostgreSQL real             |
| persistência após queda     | `scripts/verify-persistence.mjs` — reinicia o banco e reconta             |
| volume                      | `scripts/volume-check.mjs` — 50.000 pedidos, 150.000 itens                |

Contagens de teste e cobertura ficam em [docs/STATUS.md](docs/STATUS.md), e **só lá**: repetidas em dois documentos elas divergem, que foi o que aconteceu ([REVIEW-09](docs/handoffs/REVIEW-09-pos-p2-01-codex.md), R09-09). O 27/27 acima é exceção porque está atado à lista fixa de exigências do enunciado, não ao código.

## Organização

```text
src/
  domain/                      entidades e regras de negócio puras
  application/
    ports/                     interfaces exigidas pelos casos de uso
    use-cases/                 coordenação das operações
  infrastructure/
    config/                    leitura e validação do ambiente
    database/                  implementações PostgreSQL
    integrations/              um adaptador por forma de entrega, não por cliente
  presentation/http/           rotas e tradução HTTP
  main/                        composição das dependências e inicialização
```

As dependências apontam para dentro: o domínio não conhece Prisma nem Fastify, e os casos de uso dependem de interfaces que a infraestrutura implementa. Isso não é organização de pastas — é o que permite a suíte inteira rodar sem banco, substituindo o adaptador e mantendo o contrato. Adaptadores de clientes novos estendem a ingestão sem adicionar condicionais de cliente às regras de conferência.

Os objetos e as portas estão desenhados em [docs/diagrams/](docs/diagrams/README.md), derivados do código.

## Limitações conhecidas

Registradas porque são reais, não porque não têm solução:

- **A carga é síncrona.** 50.000 pedidos são uma requisição HTTP de 3,2 minutos. Funciona no Compose; um balanceador com tempo limite padrão a derruba, e não há retomada — o cliente reenvia tudo. Ingestão assíncrona com protocolo de acompanhamento é o desenho certo e é mudança de contrato.
- **O teto de requisições é por origem, não por identidade.** Sem autenticação — que o enunciado explicitamente não pede — clientes atrás do mesmo IP dividem a quota. Configurável por `RATE_LIMIT_MAX`.
- **Windows-1252 com CRLF** tem teste unitário no leitor de CSV, não fixture ponta a ponta com arquivo de ERP real.
- **Migração e runtime usam a mesma credencial.** Separar DDL de DML fica para quando houver ambiente implantado.
- **Não há CI**, e a política de exceção da auditoria npm não está definida.
- `GET /metrics` está desenhado em [ADR-005](docs/decisions/ADR-005-observabilidade.md) e não implementado.

Não foram implementados por não serem pedidos: autenticação, autorização, controle de acesso por cliente, SLA, métricas e fila.

## Próxima etapa

As features do enunciado estão completas para os quatro clientes. O que falta não é produto: **pipeline de CI** e a **política de exceção da auditoria npm**, que rodariam a suíte de integração contra um banco efêmero a cada mudança.

Estado corrente e posse das tarefas: [docs/STATUS.md](docs/STATUS.md) e [docs/TASKS.md](docs/TASKS.md). Colaboração entre agentes: [AGENTS.md](AGENTS.md).
