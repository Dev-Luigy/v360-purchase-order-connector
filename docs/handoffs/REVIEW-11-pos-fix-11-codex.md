# REVIEW-11 — verificação pós-FIX-11

- Agente e data: Codex, 2026-09-29.
- Escopo: conferir cada fechamento de R10-01 a R10-07 no código, nos testes, no PostgreSQL e por sondas adversariais.
- Produção preservada: esta revisão alterou apenas o quadro e este handoff.

## Veredito

FIX-11 melhorou materialmente o projeto, mas os sete achados não estão todos fechados. R10-02, R10-04, R10-05 e R10-07 foram confirmados como corrigidos. R10-01 e R10-03 continuam falhando quando um pedido ou uma classe de rejeição atravessa o limite de `AdapterBatch`. R10-06 teve a documentação corrigida, mas o novo gerador de evidência não falha quando os comandos falham e atribui a `npm run check` um comando que não executou.

Resumo: **4 fechados, 2 parciais e 1 documentalmente fechado com uma nova falha no mecanismo de evidência**.

## Evidência executada

| Verificação                                           | Resultado                               |
| ----------------------------------------------------- | --------------------------------------- |
| `npm run check`                                       | passou                                  |
| `npm run test:integration`                            | 27/27 contra PostgreSQL real            |
| `npm run coverage`                                    | 94,66% linhas e 89,98% branches         |
| rebuild do Compose                                    | API e banco saudáveis                   |
| `scripts/validate-case.mjs` após a integração         | 27/27                                   |
| segunda execução imediata do validador                | 27/27                                   |
| sonda: cinco itens do mesmo pedido com `batchSize=2`  | versão `1 → 4`, deveria avançar uma vez |
| sonda: cinco conflitos de cabeçalho com `batchSize=2` | um lote de 5 rejeições                  |
| sonda: três pedidos acima do teto com `batchSize=2`   | um lote de 3 rejeições                  |

Os arquivos não commitados de CLEAN-01 foram preservados: `Dockerfile`, `compose.yaml`, `prisma/schema.prisma` e a remoção de `scripts/activate-node.sh`.

## Conferência item a item

### R10-01 — parcial — transação por pedido

O novo `applyLooseItems` está correto **para o grupo que recebe**: usa um lock, uma transação, um retrato e um incremento de versão. Os testes diretos do repositório comprovam rollback e concorrência.

O fechamento fica incompleto em `src/application/use-cases/ingest-purchase-orders.ts:52-95`: `agruparPorPedido` recebe apenas `batch.staged`. O `SplitJsonAdapter` rende staging a cada `batchSize`, portanto as linhas do mesmo pedido podem chegar em vários lotes e cada lote abre nova transação.

Reprodução com um pedido existente, cinco itens e `batchSize=2`:

```json
{
  "beforeVersion": 1,
  "afterVersion": 4,
  "versionDelta": 3,
  "itemCount": 5,
  "itemsAccepted": 5
}
```

Assim, acima de 200 linhas no adaptador de produção, ainda existem múltiplas transações por pedido, retratos intermediários visíveis e regravações sucessivas. O custo deixou de ser por linha, mas continua crescendo por lote, e uma falha num lote posterior não desfaz os anteriores.

Por que os testes não viram: `tests/p2-01-gama-delta.test.ts` usa duas linhas, abaixo do lote padrão; `tests/integration/staging.test.ts` chama o repositório diretamente com um grupo já montado. Falta atravessar adaptador → caso de uso → repositório com o mesmo pedido cruzando dois ou mais lotes.

Correção exige decidir onde vive a unidade transacional sem reter a carga inteira em memória. Opções seguras são staging por ingestão seguido de consolidação por pedido, ou um protocolo explícito de início/acúmulo/finalização. Apenas aumentar o lote adia o defeito.

### R10-02 — fechado — contagem de itens aceitos

`replaceSnapshot` agora retorna `fromLoad` e `recovered`; itens apenas preservados não entram no relatório. A sonda original passou:

```json
{ "headerOnlyItemsAccepted": 0 }
```

A reconciliação também conta somente os itens efetivamente recuperados. Há regressões no caso de uso e no PostgreSQL.

### R10-03 — parcial — rejeições ainda escapam do lote

Itens e cabeçalhos inválidos comuns agora escoam durante a leitura. A sonda original de cinco itens inválidos com lote 2 passou como `[2, 2, 1]`.

Dois `continue` ainda pulam a conferência de lote em `src/infrastructure/integrations/split-json-adapter.ts`:

1. cabeçalho repetido/conflitante, linhas 88-104;
2. pedido acima de `maxItemsPerOrder`, linhas 205-214.

Reproduções:

```text
batchSize=2, cinco conflitos do mesmo cabeçalho -> [5]
batchSize=2, três pedidos acima do teto         -> [3]
```

O teste novo verifica apenas `porLote.length > 1`; ele deve afirmar também que **todo** lote tem tamanho `<= batchSize`, e precisa cobrir cabeçalhos conflitantes e overflow de pedidos.

### R10-04 — fechado — cabeçalhos Delta duplicados

Duplicata idêntica é deduplicada. Cabeçalhos normalizados que discordam marcam o pedido como conflitante e impedem sua gravação. As duas regressões passam. A repetição massiva do conflito ainda viola o lote, mas isso pertence a R10-03, não à decisão de consistência.

### R10-05 — fechado para o cenário reproduzido — validador repetível

O validador passou duas vezes seguidas depois da suíte de integração, sempre 27/27. Filtros passaram a conferir pertinência/ausência de vazamento, e o resumo compara o delta contra uma linha de base.

Ele ainda não cria banco isolado nem identificadores exclusivos: algumas consultas antigas continuam limitadas à primeira página e selecionam o primeiro pedido do cliente. Isso é uma fragilidade residual diante de um banco arbitrariamente povoado, mas não reproduziu o defeito original de segunda execução ou resíduo da integração.

### R10-06 — documentação fechada; mecanismo de evidência inseguro

README não repete mais a contagem da integração, STATUS lista `0003`, e os números atuais conferem com as execuções.

O novo `scripts/evidence.mjs`, porém, não é fail-closed:

- `rodar` captura qualquer falha de `npm` e devolve a saída como se fosse sucesso;
- a cobertura pode ter falhas e o script ainda grava o STATUS e termina com código zero;
- na integração ele lê apenas `tests`, não `fail`, e pode publicar uma contagem de uma suíte que falhou;
- executa `npm run coverage`, mas escreve a evidência sob o rótulo `npm run check`; geração, schema, typecheck, lint, format-check e build não foram executados por esse script;
- `npm run evidence` sem `--full` substitui a linha inteira e remove a evidência de integração anteriormente registrada;
- não existe teste para o gerador.

O gerador deve abortar sem escrever se qualquer comando falhar, distinguir `check` de `coverage`, exigir integração no modo completo e preservar evidência anterior quando ela não foi medida.

### R10-07 — fechado — JSDoc duplicado

O bloco duplicado foi removido de `purchase-order-repository.ts`.

## Regressões necessárias

1. Mesmo pedido Delta com `batchSize=2` e cinco itens: um incremento e atomicidade definida para a carga inteira.
2. Falha no segundo lote do mesmo pedido: provar a política escolhida, sem retrato parcial acidental.
3. Todo `AdapterBatch` obedece `orders.length + rejected.length <= batchSize` e `staged.length <= batchSize` em todas as saídas.
4. Repetições conflitantes de cabeçalho respeitam o lote.
5. Múltiplos pedidos acima do teto respeitam o lote.
6. `evidence.mjs` não escreve e retorna falha quando check, coverage ou integração falham.
7. O modo sem banco preserva a última evidência de integração ou a marca explicitamente como não medida, sem apagá-la silenciosamente.

## Pendências deliberadas, sem mudança

- CI e política de exceção da auditoria npm;
- expiração/teto global do staging;
- medição de volume do caminho Delta de itens avulsos;
- separação de credenciais DDL/DML.

## Próximo passo sugerido

Abrir FIX-12 para R10-01 atravessando lotes, os dois escapes de R10-03 e o gerador de evidência. Não alterar a semântica de transação por pedido silenciosamente: a solução precisa continuar compatível com leitura em fluxo e com o limite de memória do ADR-008.
