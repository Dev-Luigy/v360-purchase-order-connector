# Handoff: REVIEW-15 — validação integral pós-FIX-15 com banco limpo

- Agente e data: Codex, 2026-09-29.
- Estado: concluída com dois defeitos reproduzidos.
- Veredito: R14-01 determinístico, R14-02 e R14-03 foram corrigidos no código, e toda a aceitação oficial passou. FIX-15 ainda não pode ser considerado fechado: o novo ciclo de publicação deixa resíduos permanentes quando a leitura falha e abre uma janela em que outra requisição consome uma linha antes de o relatório da carga dona contabilizá-la.
- Escopo: banco removido e recriado, documento completo, cenários felizes, falhas, limites, concorrência, volume, persistência, segurança, Docker e PostgreSQL real. Nenhum código de produção foi alterado.

## Estado do banco usado

O volume `v360-purchase-order-connector_postgres_data` foi removido conforme autorização explícita do usuário. O Compose foi reconstruído do zero e aplicou `0001` a `0007`. Antes dos testes: zero pedidos, conferências e staging.

Após toda a validação, todas as tabelas de negócio foram truncadas novamente. Estado entregue:

```text
purchase_order=0
items=0
conference=0
divergences=0
staging=0
migrations=7
```

API e PostgreSQL terminaram saudáveis. Não sobrou diretório `v360-ingest-*` no container.

## Achados

### R15-01 — alta — falha de leitura deixa staging não publicado e responde 500

Sonda pela rota real enviou JSON truncado **depois de 200 itens válidos**, para garantir que um lote já tivesse atravessado o repositório. Resultado:

```json
{
  "httpStatus": 500,
  "error": "erro_interno",
  "unpublishedRowsLeft": 200
}
```

O log confirma `stream-json: Parser has expected a value`. O erro do parser é `Error`, não `SyntaxError`/`FieldError`, então `toProblem` o trata como defeito interno. Mais importante: `IngestPurchaseOrders.execute` não desfaz a carga quando o `for await` termina com erro. As linhas novas nascem `publicada=false` e ficam invisíveis para reconciliação, mas permanecem no banco sem caminho de recuperação.

Isso não corrompe um pedido, porém transforma payload inválido comum em crescimento permanente de staging. Queda do processo entre `stageLooseItems` e `publishStaged` produz o mesmo estado e não pode ser resolvida apenas por `catch`.

Correção recomendada:

1. adicionar operação de descarte por `(clientId, ingestionId)` e envolver leitura/publicação em compensação para toda falha recuperável;
2. traduzir erro estrutural do parser para um erro de payload estável, retornando 422, sem vazar mensagem interna;
3. definir limpeza segura de cargas não publicadas abandonadas após queda: ciclo de ingestão com estado/lease ou sweep com idade e garantia de não apagar carga ainda ativa;
4. não usar apenas TTL cego menor que a duração máxima de uma carga.

Critérios de aceite:

- JSON truncado após mais de um lote retorna 422;
- nenhuma linha daquela `ingestionId` permanece;
- erro antes do primeiro lote também retorna o mesmo contrato;
- uma queda simulada deixa resíduo identificável e o mecanismo de recuperação o remove sem atingir carga ativa;
- repetir o cenário não aumenta staging.

### R15-02 — alta — publicação antes da consolidação quebra a contabilidade da carga

A carga publica **todas** as linhas e só depois consolida pedido a pedido. Nesse intervalo, `replaceSnapshot` de outro cabeçalho pode consumir uma linha publicada que ainda pertence ao relatório da carga em andamento.

Sonda real:

1. iniciou carga item-only com 2.000 pedidos distintos, mantendo o alvo como último;
2. aguardou o alvo ficar `publicada=true` no PostgreSQL;
3. enviou o cabeçalho do alvo pela rota enquanto a primeira carga consolidava os pedidos anteriores;
4. o cabeçalho recuperou um item;
5. o relatório da carga dona terminou contabilizando 1.999 dos 2.000 registros.

```json
{
  "itemLoad": {
    "status": 200,
    "itemsAccepted": 0,
    "rejectedTotal": 0,
    "stagedTotal": 1999,
    "accounted": 1999,
    "input": 2000
  },
  "headerLoad": {
    "status": 200,
    "itemsAccepted": 1
  }
}
```

O dado final está correto, mas o requisito 3 exige que o relatório diga quantos passaram e quantos travaram. A linha some do relatório que a recebeu. É a vizinhança da corrida que FIX-15 fechou durante a **leitura**; o teste oficial cobre cabeçalho antes da publicação, não após a publicação e antes da consolidação.

Correção sugerida: finalizar cada pedido sob o mesmo advisory lock, decidindo atomicamente entre aplicar ao pedido existente ou publicar a espera quando o cabeçalho não existe. Uma publicação global antes de contabilizar os próprios itens permite apropriação cruzada. A solução precisa preservar streaming e uma transação por pedido.

Critérios de aceite:

- repetir a sonda de 2.000 pedidos não pode produzir diferença entre registros únicos de entrada e `itemsAccepted + rejectedTotal + stagedTotal`;
- o cabeçalho concorrente não pode atribuir a si item de carga ainda sem relatório final;
- duas cargas item-only concorrentes continuam isoladas;
- órfão legítimo continua publicado e reconciliável depois do fim da carga;
- não segurar transação ou lock por todo o arquivo.

### R15-03 — média, teste — o 13º cenário não testa o que o nome afirma

O cenário `carga só de cabeçalho relata só o que veio da espera` cria pedido com três itens, envia um quarto por item-only e consulta o detalhe. Como o pedido já existe, o quarto item é consolidado pela própria carga; não há carga posterior só de cabeçalho nem resíduo de staging. Portanto ele não exercita R14-03.

O código corrigido passou numa sonda real com pedido de três itens, uma linha publicada em staging e reenvio apenas do cabeçalho: `itemsAccepted=1` e retrato final com quatro itens. A implementação está correta, mas a regressão oficial é falso positivo e deve preparar explicitamente o estado residual, de preferência em teste de integração; se a exigência continuar sendo HTTP real, a preparação pode usar PostgreSQL e a verificação deve continuar pelas rotas.

### R15-04 — baixa — documentação ainda deriva

- `README.md` ainda descreve `validate:http` como 10 cenários, embora sejam 13.
- A seção de limitações do README ainda diz que Windows-1252/CRLF não tem fixture ponta a ponta, mas FINAL-01 adicionou `tests/fixtures/beta-erp/` e `validate-case` a exercita.

## O que passou

### Suítes e requisitos

| Prova                           | Resultado                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `npm run check`                 | 245 testes; 229 passaram; 16 integrações puladas sem banco; zero falhas       |
| `npm run coverage`              | 93,06% linhas; 90,12% branches; 88,46% funções                                |
| `npm run test:integration`      | 31/31 no PostgreSQL real                                                      |
| `validate-case.mjs`, duas vezes | 30/30 em ambas pela API real                                                  |
| `npm run validate:http`         | 13/13 pela API real                                                           |
| cursor v2 pela rota             | contém `after`, `until` e fingerprint; v1 e troca de filtro retornam 400      |
| `npm run validate:sweep`        | 20.000 iniciais, 8 lotes durante, 2 depois, zero repetidos/perdidos           |
| `verify-persistence.mjs`        | pedido, item, conferência e divergência sobreviveram ao restart do PostgreSQL |

Os 13 cenários HTTP confirmaram fixtures, conferência e relatório, concorrência em linhas iguais e distintas, duplicata, 10.000/10.001 itens, falha de agregado, preservação de snapshot, órfão, limite desalinhado e invisibilidade durante a leitura.

### Volume integral dos quatro formatos

Cada formato recebeu 20.000 pedidos e 60.000 itens nesta execução:

| Cliente | Tempo |         Vazão | Rejeitados | Repetidos | Profundidade última/primeira |
| ------- | ----: | ------------: | ---------: | --------: | ---------------------------: |
| Alfa    | 82,8s | 242 pedidos/s |          0 |         0 |                        0,56× |
| Beta    | 81,4s | 246 pedidos/s |          0 |         0 |                        0,54× |
| Gama    | 82,5s | 242 pedidos/s |          0 |         0 |                        0,48× |
| Delta   | 83,7s | 239 pedidos/s |          0 |         0 |                        0,45× |

Total medido nesta rodada: **80.000 pedidos e 240.000 itens**. A memória observada ficou aproximadamente entre 784 e 796 MiB durante a sequência, sem crescimento proporcional ao volume.

### Docker e segurança

- `docker compose config --quiet` passou.
- `docker build --check .` passou sem aviso.
- runtime executa como `uid=1000(node)`.
- imagem runtime não contém CLI Prisma, `mysql2` nem `deepmerge-ts`.
- `npm audit --omit=dev --audit-level=high` continua retornando quatro vulnerabilidades altas em `deepmerge-ts`/`mysql2` pelo grafo opcional/de desenvolvimento do Prisma. O runtime está mitigado; política e CI continuam ausentes. Não aplicar o downgrade forçado sugerido pelo audit.

## Cobertura do documento

Foram exercitados os quatro formatos, contrato unificado, todos os filtros, paginação e troca de filtro, detalhe e saldo, as sete regras de conferência, histórico e resumo, identidade composta, reenvio, precisão decimal, unidades, situações, Windows-1252/CRLF, Delta desacoplado, aceitação parcial, limites, volume, escrita concorrente e persistência. As 30 asserções do validador passaram duas vezes para provar repetibilidade.

## Próximo trabalho recomendado

Criar `FIX-16` para R15-01, R15-02 e R15-03. A aceitação precisa manter PostgreSQL e HTTP reais. R15-01 e R15-02 devem ser tratados juntos porque ambos pertencem ao ciclo de vida da ingestão; corrigir apenas a limpeza não fecha a apropriação cruzada depois da publicação.

## Arquivos desta revisão

- `docs/handoffs/REVIEW-15-validacao-integral-pos-fix-15-codex.md`
- `docs/TASKS.md`
- `docs/STATUS.md`

Alterações preexistentes em `Dockerfile`, `compose.yaml`, `prisma/schema.prisma` e a remoção de `scripts/activate-node.sh` foram preservadas.
