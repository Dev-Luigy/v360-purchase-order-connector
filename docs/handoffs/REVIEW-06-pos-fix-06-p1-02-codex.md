# Handoff: REVIEW-06 — verificação pós-FIX-06 e P1-02

- Agente e data: Codex, 2026-09-28.
- Estado: revisão concluída; nenhum código de produção foi alterado.
- Escopo: conferir as correções de REVIEW-05, as funcionalidades de persistência entregues em P1-02, testes, arquitetura, Docker, segurança e documentação.
- Limite preservado: nenhum PostgreSQL ou stack Compose foi iniciado. A execução real da migração e dos repositórios continua pertencendo a ENV-03.

## Veredito

FIX-06 corrigiu de fato a maior parte de REVIEW-05. O runtime constrói e não contém Prisma CLI, `mysql2`, `deepmerge-ts` nem `@prisma/config`; o cursor agora é versionado; a última migração esperada participa da prontidão; a FK de conferência usa `RESTRICT`; a ordem das divergências é persistida; os índices e os `CHECK` pedidos existem; o check completo está verde com 114 testes.

P1-02, porém, ainda não está validada de ponta a ponta. Foram encontrados três defeitos novos reproduzíveis no contrato/readiness/cursor, a auditoria npm continua vermelha apesar de o runtime estar limpo, e o estágio de migração ainda emite aviso de OpenSSL. Também continuam ausentes os testes de comportamento dos repositórios contra PostgreSQL e qualquer pipeline de CI.

As “funcionalidades” novas são infraestrutura de persistência, não funcionalidades HTTP disponíveis. A aplicação ainda expõe somente `GET /health` e `GET /ready`; casos de uso e rotas de ingestão, consulta, conferência e relatório continuam em P1-04.

## REVIEW-05 conferido item a item

| Item                                | Resultado desta revisão                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dockerfile                          | Runtime e estágio `migrate` constroem. O problema de cópia do schema foi fechado. Há ressalva de OpenSSL abaixo.                                                                  |
| Readiness pela migração esperada    | Implementado e testado para ausente, inacabada, revertida e concluída. Há falha nova no cenário de reexecução após rollback.                                                      |
| Dependências vulneráveis no runtime | Fechado quanto à superfície executável: a imagem não contém os cinco pacotes removidos e ainda carrega o acesso PostgreSQL. A árvore/lockfile npm continua auditando em vermelho. |
| Índices alinhados à paginação       | Corrigidos no schema e no SQL. Plano real continua sem `EXPLAIN`, dependente de ENV-03.                                                                                           |
| Testes/check                        | Fechado para helpers, cursor, mapping e readiness; `npm run check` está verde. Repositórios continuam sem teste de comportamento.                                                 |
| Histórico imutável                  | Fechado: `conference -> purchase_order` usa `ON DELETE RESTRICT`.                                                                                                                 |
| `CHECK` no banco                    | As nove invariantes estão no SQL. A aplicação real delas continua não executada.                                                                                                  |
| Cursor conforme ADR-010             | Payload `{ v, after, f }` fechado; a impressão ainda não é injetiva.                                                                                                              |
| Ordem de divergências               | Fechado com `position`, unicidade por conferência e leitura ordenada.                                                                                                             |
| Manutenção de migração              | `migration_lock.toml` e `schema:check` entraram; README de migrações foi atualizado. A geração ainda ocorre três vezes no `check`, mas é custo, não defeito funcional.            |

## Achados novos

### R06-01 — alto — o schema de domínio aceita valores que o banco não consegue armazenar

O contrato Zod valida conteúdo mínimo, mas não compartilha os limites das colunas Prisma/PostgreSQL. Provas executadas retornaram `true` para todos estes valores:

- `clientId` com 65 caracteres para `VARCHAR(64)`;
- `externalNumber` com 65 para `VARCHAR(64)`;
- `supplier.name` com 257 para `VARCHAR(256)`;
- `material` com 129 para `VARCHAR(128)`;
- `description` com 513 para `VARCHAR(512)`;
- `purchaseUnit` com 17 para `VARCHAR(16)`;
- `externalLine = 2147483648`, acima de `INTEGER` do PostgreSQL.

O mesmo vale para a nota: `invoiceCheckRequestSchema` não limita tamanho de strings nem quantidade de linhas. Uma nota sintética com 10.001 linhas foi aceita. `Divergence.received` pode copiar texto da nota para uma coluna `VARCHAR(512)`, fazendo uma conferência válida para o schema falhar apenas na persistência.

Impacto: o adaptador/HTTP pode considerar o registro válido e o repositório abortar a transação com erro de banco. Quando P1-04 traduzir isso para HTTP, o risco é virar 500 em vez de rejeição determinística, além de abrir consumo de CPU/memória sem teto.

Correção esperada: definir constantes únicas de limites do contrato, aplicá-las nos schemas Zod, refletir as mesmas grandezas no schema Prisma e testar exatamente `máximo`, `máximo + 1`, `INTEGER_MAX` e `INTEGER_MAX + 1`. Definir também teto por pedido e por nota antes de expor as rotas. Não truncar silenciosamente.

### R06-02 — médio — readiness é dependente da ordem das linhas após recuperar migração falha

`SchemaReadiness` busca todas as linhas com o nome esperado e usa apenas `rows[0]`, sem `ORDER BY` nem filtro de sucesso. O fluxo oficial do Prisma permite marcar uma tentativa falha como revertida e aplicar novamente a mesma migração. Nesse caso podem existir a tentativa antiga revertida e a nova concluída.

Sonda com as mesmas duas linhas:

- `[revertida, concluída]` resultou em `not-ready`;
- `[concluída, revertida]` resultou em `ready`.

Logo, a disponibilidade pode depender da ordem não especificada do PostgreSQL. A documentação do Prisma confirma que marcar como rolled back permite reaplicar a migração: <https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing>.

Correção esperada: considerar pronta se existir linha para a migração com `finished_at IS NOT NULL AND rolled_back_at IS NULL`; consultar separadamente o estado de falha apenas para produzir a mensagem. Adicionar regressão com tentativa revertida seguida por tentativa concluída, nas duas ordens.

### R06-03 — médio — fingerprint do cursor ainda tem colisão de representação

`fingerprintOf` converte valores com `String(value)` e representa `null` com o caractere NUL. Isso conflui valores diferentes:

- `{ a: null }` e `{ a: "\0" }` têm a mesma impressão;
- `{ a: 1 }` e `{ a: "1" }` têm a mesma impressão;
- `{ a: true }` e `{ a: "true" }` têm a mesma impressão.

A primeira colisão foi reproduzida com o conjunto real de filtros de pedidos: `clientId: null` e `clientId: "\0"` geraram exatamente `b4be3e83b653eac1` com os demais filtros iguais.

O TypeScript evita algumas misturas nos chamadores atuais, mas não valida dados em runtime, e `ClientId` é apenas string. A função afirma produzir serialização canônica de primitivos, então precisa distinguir tipo e valor.

Correção esperada: serializar uma lista ordenada de tuplas com tipo explícito, por exemplo `JSON.stringify([[key, "null"], [key, "string", value]])`, e testar controles, separadores, número/string e boolean/string. A futura borda HTTP também deve rejeitar caracteres de controle.

### R06-04 — médio — a exposição de runtime caiu, mas o gate de segurança npm segue vermelho

`npm audit --omit=dev --audit-level=low` ainda retorna quatro vulnerabilidades altas: `deepmerge-ts` e duas advisory classes em `mysql2`, trazidas pela relação de peer opcional entre `@prisma/client` e o CLI. O `npm audit fix --force` continua propondo downgrade incompatível para Prisma 6 e não deve ser executado.

A prova dentro da imagem é positiva: `prisma`, `@prisma/config`, `mysql2` e `deepmerge-ts` não existem; `@prisma/client`, `@prisma/adapter-pg` e `pg` existem e o módulo de acesso a dados carrega. Ainda assim, a árvore/lockfile do projeto não permite um gate ingênuo de `npm audit` verde e precisa de política explícita para CI, acompanhamento de upstream e varredura do artefato final.

### R06-05 — médio/baixo — o estágio de migração continua emitindo aviso de OpenSSL

Executar `prisma migrate deploy --help` como usuário `node` dentro da imagem `migrate` emitiu duas vezes que o Prisma não detectou OpenSSL e “may not work as expected”. Uma execução contra uma porta deliberadamente fechada chegou corretamente a `P1001`, mostrando que o CLI e o engine iniciam; portanto, o aviso não foi provado fatal neste host.

Isso não deve ser tratado como validado em produção. Em ENV-03, executar a migração real com a mesma imagem. Se o aviso permanecer, instalar explicitamente o pacote suportado no estágio que contém o CLI ou documentar, com referência à versão 7 usada, por que o warning é inócuo. O runtime com driver `pg` não exibiu esse problema.

### R06-06 — médio — repositórios ainda não têm prova de comportamento

Os 17 testes de `database-unit.test.ts` exercitam funções puras, cursor, mapping e um pool simulado para readiness. Nenhum instancia `PrismaPurchaseOrderRepository` ou `PrismaConferenceRepository` contra banco.

Continuam sem prova executável:

- criação e reingestão preservando ID e incrementando versão;
- `items: null` versus `items: []`;
- advisory lock em duas cargas concorrentes;
- atomicidade em erro no meio da substituição;
- coerência de `has_pending_balance` e dos nove `CHECK`;
- `RESTRICT` do histórico;
- paginação/filtros e ordem de divergências no Prisma real;
- resumo por nota versus ocorrência;
- planos dos índices com `EXPLAIN (ANALYZE, BUFFERS)`;
- migração, restart e persistência do volume Compose.

É correto manter isso em ENV-03, mas P1-02 só está concluída “como código”, não validada operacionalmente.

### R06-07 — médio — não existe CI/CD executável

Não há arquivos versionados em `.github/` nem configuração de outro provedor. `npm run check`, builds Docker e auditorias dependem de execução manual. O plano de REVIEW-04 ainda não virou pipeline.

Mínimo recomendado: check completo, build dos estágios `runtime` e `migrate`, teste de integração com PostgreSQL efêmero, verificação de migração em banco vazio, política documentada para advisories aceitas e scan da imagem final. Publicação/deploy deve ficar fora até existir ambiente e credenciais definidos pelo usuário.

### R06-08 — baixo — documentação principal está divergente do código

- O README ainda diz que não há tabelas, migrações executáveis ou adaptadores Alfa/Beta; diz também que `/ready` verifica só conectividade e aponta o próximo passo como implementar domínio/migrações/adaptadores.
- O README referencia `scripts/activate-node.sh`, que permanece apagado no working tree por alteração preexistente do usuário.
- `docs/STATUS.md` ainda lista como abertos os quatro pontos que FIX-04 fechou.
- `docs/TASKS.md` em FIX-06 liga para `handoffs/REVIEW-05-codex.md`, mas o arquivo real é `REVIEW-05-p1-02-codex.md`.

## Arquitetura atual

O desenho continua organizado e coerente com SOLID: domínio não importa Fastify, Prisma ou ambiente; portas pequenas ficam em aplicação; Prisma, pools e adaptadores ficam em infraestrutura; composição está em `src/main`. Os pools por propósito, decimal exato, streaming dos formatos de cliente e migração fora do processo da API são decisões boas.

As fronteiras que faltam fechar são claras, não uma necessidade de reestruturação geral: limites compartilhados entre contrato e banco, composição/casos de uso de P1-04, testes reais de persistência e automação de CI. Não recomendo trocar stack, ORM ou reorganizar pastas agora.

## Evidências executadas

- `npm run check`: verde.
- `node --import tsx --test --test-isolation=none "tests/**/*.test.ts"`: 114/114 verdes.
- `docker compose config --quiet`: verde.
- `docker build --check .`: verde, sem warnings do Dockerfile.
- build real dos estágios `runtime` e `migrate`: verde.
- runtime efêmero: módulos vulneráveis/CLI ausentes e driver PostgreSQL presente; import do cliente passa.
- metadados do runtime: usuário `node`, comando `node dist/main/server.js`, 733.415.529 bytes.
- estágio `migrate` como usuário `node`: CLI disponível; aviso de OpenSSL reproduzido; conexão deliberadamente impossível termina em `P1001`, sem alteração externa.
- `npm audit --omit=dev --audit-level=low`: falhou com quatro vulnerabilidades altas na árvore/lockfile.
- sondas temporárias de limites, colisão do cursor e múltiplas tentativas da mesma migração: achados R06-01 a R06-03 reproduzidos.
- PostgreSQL real, Compose e migração real: não executados, por escopo de ENV-03.

## Próxima ordem sugerida ao Claude

1. Abrir FIX-07 para R06-01, R06-02 e R06-03, cada um com regressão.
2. Resolver ou documentar R06-05 antes de ENV-03; não aceitar apenas “a imagem constrói” como prova da migração.
3. Executar ENV-03 com PostgreSQL real e transformar R06-06 em suíte de integração.
4. Criar tarefa própria de CI para R06-04 e R06-07, sem `audit fix --force`.
5. Atualizar README/STATUS e corrigir o link de REVIEW-05.
6. Só então integrar P1-04, garantindo que os limites de R06-01 façam parte da borda HTTP.

## Arquivos alterados nesta revisão

- `docs/TASKS.md`
- `docs/handoffs/REVIEW-06-pos-fix-06-p1-02-codex.md`

A exclusão preexistente de `scripts/activate-node.sh` foi preservada.
