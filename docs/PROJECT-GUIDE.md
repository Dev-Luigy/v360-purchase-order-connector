# Guia do projeto

Este guia ajuda a formar um modelo mental do V360 Purchase Order Connector e a
encontrar o código responsável por cada comportamento. Não redefine rotas,
regras de negócio ou decisões: veja [API](API.md), [ADRs](decisions/README.md)
e [status](STATUS.md) para essas fontes.

## Em uma frase

O serviço recebe arquivos em formatos diferentes, converte registros válidos
para um contrato comum, persiste pedidos e itens no PostgreSQL, compara notas
fiscais com pedidos e expõe consultas e relatórios paginados.

## Como as camadas se relacionam

Uma requisição entra pelo Fastify (`src/presentation/http`), é validada na
borda, chama um caso de uso (`src/application/use-cases`) e acessa portas
(`src/application/ports`). O domínio (`src/domain`) contém os contratos e as
regras que não devem depender de HTTP, Prisma ou configuração. A infraestrutura
implementa as portas com PostgreSQL/Prisma e adaptadores de entrada. A
composição concreta acontece em `src/main/server.ts`.

TypeScript verifica contratos durante o build; Zod valida dados externos em
runtime — parâmetros, corpo, cabeçalhos e valores que chegam dos arquivos —
antes de avançarem para as operações tipadas.

```text
HTTP → caso de uso → porta ← adaptador de infraestrutura
             ↓
          domínio
```

O domínio não aponta para fora. Um caso de uso pode ser testado com repositórios
substitutos; a integração real verifica as garantias do PostgreSQL. O diagrama
de [classes e contratos](diagrams/classes.md) mostra os principais tipos e
implementações sem enumerar cada método de cada rota.

## O caminho de uma carga

1. `POST /clients/:clientId/ingestions` identifica o perfil pelo caminho,
   valida versão e partes multipart permitidas e grava os arquivos em spool
   temporário. A lista completa de rotas e erros está em [API](API.md).
2. `IngestPurchaseOrders` encontra o perfil e o adaptador da forma de entrega.
   Antes de persistir, o adaptador confere a estrutura do arquivo; depois lê em
   fluxo, sem materializar a carga inteira.
3. O adaptador transforma os dados de origem em tipos normalizados. Linhas
   inválidas são reportadas individualmente; falha estrutural interrompe a
   carga. Os quatro clientes reutilizam quatro formas de entrega, não quatro
   caminhos de regra de negócio:

   | Cliente         | Formato       | Particularidade                                                             |
   | --------------- | ------------- | --------------------------------------------------------------------------- |
   | Alfa            | `nested-json` | pedidos e itens aninhados                                                   |
   | Beta / Beta ERP | `paired-csv`  | cabeçalhos e itens em arquivos separados; perfis diferem também em encoding |
   | Gama            | `flat-json`   | uma linha representa dados de pedido e item                                 |
   | Delta           | `split-json`  | consultas independentes para cabeçalhos e itens                             |

4. Cabeçalhos válidos substituem o retrato do pedido numa transação e podem
   consumir itens publicados que aguardavam esse número. Itens recebidos sem
   cabeçalho são acumulados no staging da carga. Ao fechar cada número, o
   repositório decide sob lock: se o pedido existe, incorpora as linhas; se não,
   publica-as como espera visível para uma carga futura.
5. A resposta resume aceitos, recusados e itens que continuam esperando. O
   spool temporário é removido ao fim da requisição.

O processo e os caminhos alternativos estão em
[processes.md](diagrams/processes.md). Limites, formatos
exatos e exemplos de payload permanecem somente em [API](API.md) e nos perfis
em `src/infrastructure/integrations/client-profiles.ts`.

## Os outros dois fluxos de negócio

- **Consultar pedidos:** `ListPurchaseOrders` aplica filtros e paginação pela
  porta `PurchaseOrderRepository`; `GetPurchaseOrder` busca o detalhe. Os
  repositórios PostgreSQL implementam as consultas. A paginação não é
  opcional para listas de negócio.
- **Conferir nota:** `CheckInvoice` carrega o pedido por cliente e número
  externo, executa a regra pura `checkInvoice` e grava um `ConferenceRecord`
  com a versão do pedido usada. A conferência não consome saldo do pedido; o
  histórico preserva o retrato da nota e do resultado.
- **Relatórios:** `ListConferences` pagina o histórico; `SummarizeConferences`
  agrega quantidades por resultado/código de divergência. Ambos usam filtros
  da porta `ConferenceRepository`.

As regras e os códigos de divergência são explicados em [ADR-009](decisions/ADR-009-conferencia.md);
os esquemas HTTP permanecem em [API](API.md).

## Conceitos que costumam confundir

- **`externalNumber` e `id`:** o primeiro é a identidade do pedido no ERP e é
  conhecido pela plataforma; o segundo é a identidade interna do serviço.
- **`items: null` e `items: []`:** `null` significa “esta carga não trouxe
  itens; preserve os que já existem” (caso comum do cabeçalho Delta). `[]`
  significa “a carga afirma que o pedido não tem itens”.
- **Staging publicado e não publicado:** ambos são linhas de espera, mas a
  linha não publicada ainda pertence à carga em andamento e não pode ser
  consumida por outra requisição. Ao finalizar, ou é incorporada ou fica
  publicada à espera do cabeçalho. Uma queda pode deixar estado não publicado;
  a inicialização remove apenas as linhas abandonadas mais antigas que o
  limiar configurado, preservando cargas recentes.
- **Quantidade e preço:** quantidade do pedido é guardada na unidade de compra;
  a nota informa quantidade em unidade de consumo. Decimal monetário trafega
  como texto e é calculado sem ponto flutuante. Detalhes e exemplos estão nas
  ADRs 007 e 009.
- **Prontidão:** `/health` verifica vida do processo; `/ready` verifica também
  que a versão esperada do schema foi migrada. A API e o processo de migração
  são inicializados separadamente no Compose.

## Roteiro para conhecer o código

Uma leitura curta, seguindo o fluxo em vez de abrir pastas sem contexto:

1. `src/domain/purchase-order.ts`, `conference.ts` e `ingestion.ts` — objetos
   compartilhados entre as camadas.
2. `src/application/ports/` — o que os casos de uso precisam de seus
   adaptadores.
3. `src/application/use-cases/ingest-purchase-orders.ts` e
   `check-invoice.ts` — orquestração e regras chamadas.
4. `src/presentation/http/routes/` — entrada HTTP e validação de borda.
5. `src/infrastructure/integrations/` — profiles e parsing de formatos.
6. `src/infrastructure/database/` — transações, staging, consultas e mapeamento
   Prisma/PostgreSQL.
7. `src/main/server.ts` — composição, startup, limpeza após queda e shutdown.
8. `tests/` — testes puros/HTTP; `tests/integration/` — integração PostgreSQL.

Para executar, use [SETUP](SETUP.md). `npm run check` roda tipagem, lint,
formatação, testes sem dependência de banco e build. `npm run test:integration`
requer PostgreSQL de teste descartável; não aponte a suíte a um banco com dados
que devam ser preservados.

O workflow de CI está em `.github/workflows/ci.yml`. A política de auditoria de
dependências está em `security/audit-exceptions.json` e é executada por
`npm run audit:policy`; ela controla exceções temporárias, não significa que
os avisos transitivos do Prisma desapareceram. O workflow foi validado por
seus comandos locais, mas ainda não foi disparado por um remoto GitHub, segundo
o [handoff OPS-01](handoffs/OPS-01-claude.md).

## Navegação da documentação

Comece em [ENGINEERING.md](ENGINEERING.md) para o mapa dos documentos. Use
[STATUS](STATUS.md) para o retrato atual e [TASKS](TASKS.md) para saber quem
trabalhou em quê. O `README.md` é a apresentação e porta de entrada, não um
substituto para este guia.
