# Handoff: REVIEW-14 — verificação pós-FIX-14 e FINAL-01

- Agente e data: Codex, 2026-09-29.
- Estado: concluída com achados.
- Veredito: a entrega funcional principal passa, mas **FIX-14 não está fechado em todos os alinhamentos de lote**. Há uma falha reproduzida pelas rotas que permite aplicar depois parte de um pedido declarado integralmente recusado. A varredura nova é correta sob escrita concorrente finita, mas ainda não é um snapshot limitado e não garante término se a escrita for contínua.
- Escopo: revisão de código, migrações, Zod, testes, PostgreSQL, Docker, segurança e execução da aplicação real; nenhum código de produção foi alterado.

## Achados por prioridade

### R14-01 — alta — item de pedido recusado volta ao staging no mesmo lote

Em `src/application/use-cases/ingest-purchase-orders.ts`, o estouro remove do banco o que lotes anteriores gravaram, mas não remove de `aceitos` itens do mesmo pedido já percorridos no lote atual. Depois do `purgeStaged`, `stageLooseItems` grava esses itens outra vez.

O validador oficial usa 10.001 itens consecutivos e lote de 200. Nesse alinhamento, o lote final começa diretamente pelo item excedente e a falha fica invisível. A sonda HTTP de REVIEW-14 colocou antes um órfão de outro pedido, deslocando a fronteira em uma posição:

1. criou `R14-C1C4DEC8-TARGET` por `POST /clients/delta/ingestions`;
2. enviou um item de `...-SHIFT` seguido de 10.001 itens de `...-TARGET`;
3. a resposta informou `itemsAccepted=0`, `rejectedTotal=1` e `stagedTotal=2`;
4. a amostra de staging continha tanto `SHIFT` quanto o pedido `TARGET` que fora declarado integralmente recusado;
5. antes do reenvio do cabeçalho, o pedido tinha zero itens;
6. reenviar somente o cabeçalho respondeu `itemsAccepted=1` e aplicou a linha 10.000 ao pedido.

Isso viola a mensagem de recusa e a atomicidade por pedido. Cobertura de linha alta não detectou a combinação entre posição no lote e estado persistido.

Correção mínima: antes de gravar o lote, excluir de `aceitos` todos os itens cujos pedidos entraram em `recusados`. Correção completa: linhas de uma ingestão ainda em andamento não podem ficar publicadas para `replaceSnapshot` de outra requisição. Hoje cada lote é uma transação e o cabeçalho concorrente pode consumir o prefixo antes do estouro. É necessário um ciclo de vida de ingestão (`em_andamento`/`aceita`/`recusada`) ou publicação atômica equivalente; apenas filtrar o último lote não fecha essa corrida.

Critérios de aceite:

- acrescentar ao teste HTTP oficial o órfão deslocador + 10.001 itens;
- após a recusa, `stagedTotal` deve conter somente o órfão deslocador;
- reenviar o cabeçalho do pedido recusado não pode aplicar item algum;
- testar cabeçalho concorrente durante a carga excedente e provar que nenhum prefixo é consumido;
- manter os cenários alinhados já existentes.

### R14-02 — alta para operação contínua — cursor não congela o fim da varredura

`PrismaPurchaseOrderRepository.list` aplica apenas `id > after`. O cursor não leva um `until` obtido no início. Como UUID v7 de novos pedidos tende a avançar, uma varredura pode perseguir as novas cargas; se elas entrarem mais rápido do que a leitura, ela não tem condição própria de término.

`scripts/validate-sweep-under-load.mjs` não prova o contrário: o escritor tem `lote < cargas` e termina após 200 lotes. Portanto, mesmo uma consulta que persiga tudo termina quando o produtor finito acaba. A execução real passou e é evidência válida de ausência de repetição/perda sob escrita **finita**, não de snapshot nem de término sob escrita contínua.

Correção sugerida: na primeira página, capturar o maior `id` que satisfaz os filtros; codificar `after`, `until` e a impressão digital no cursor; nas páginas seguintes consultar `id > after AND id <= until`. O dobro em memória deve usar o mesmo contrato.

Critérios de aceite:

- o escritor continua ativo até depois de a varredura terminar;
- a varredura tem prazo de segurança e precisa terminar antes de o escritor ser encerrado;
- todos os pedidos presentes no início aparecem exatamente uma vez;
- pedidos posteriores ao teto podem ficar para a próxima varredura;
- trocar filtros continua invalidando o cursor.

### R14-03 — média — `recovered` pode contar itens antigos como recuperados

O contrato de `SnapshotResult.recovered` diz “estavam esperando pelo cabeçalho e entraram agora”. Em `replaceSnapshot`, quando `items === null` e há espera, `completo.items` inclui também `currentItems`; porém o cálculo é `completo.items.length - 0`. Assim, um pedido com itens persistidos e resíduos de staging após queda/corrida relata itens antigos como aceitos nesta carga.

O valor deve derivar dos itens efetivamente consumidos da espera, respeitando a deduplicação por linha, e não da cardinalidade final do retrato. Esse cenário deve ser testado com pedido preexistente + staging residual + carga apenas de cabeçalho.

### R14-04 — segurança e entrega — pendências conhecidas continuam abertas

- Não existe autenticação/autorização nas rotas de ingestão, consulta e conferência. O rate limit é por origem e não por cliente. No Compose a porta fica em `127.0.0.1`, o que reduz a exposição local, mas isso não é controle de produção.
- Não há pipeline de CI versionado. Nada exige automaticamente check, integração, build da imagem, migrações ou a verificação da poda da imagem.
- `npm audit --omit=dev --audit-level=high` encontra quatro vulnerabilidades altas em `deepmerge-ts` e `mysql2`, puxadas pelo CLI Prisma/peer opcional. A imagem de runtime atual foi inspecionada e não contém `prisma`, `mysql2` nem `deepmerge-ts`; falta política documentada e trava de CI. Não executar `npm audit fix --force`: ele propõe downgrade quebrável para Prisma 6.
- API e migração usam a mesma credencial de banco no Compose; separar DDL de DML antes de produção.
- Staging não tem TTL nem cota global. `maxStagedOrders` limita uma carga, não o acúmulo histórico.
- Não há prova com mais de uma réplica da API.

Para autenticação, escolher conforme o ambiente: identidade validada no gateway com cabeçalho confiável e rede fechada, ou plugin oficial Fastify como `@fastify/jwt`. Para cabeçalhos defensivos, `@fastify/helmet` é mais seguro do que mantê-los manualmente. Essas bibliotecas só devem entrar junto com um requisito e uma ADR; não são substituição automática de regra de domínio.

### R14-05 — baixa — documentação de estado derivou

`docs/STATUS.md` ainda cita migrações `0001` a `0005`, afirma na retomada que o validador cobre 27 exigências e diz que Windows-1252 tem apenas teste unitário. O estado real é migração `0006`, 30/30 e fixture ponta a ponta. Corrigir ao implementar os achados, sem usar o resumo como evidência de comportamento.

## O que foi confirmado

- As quatro formas de entrega e as rotas principais funcionam com as fixtures reais.
- A fixture Beta variante atravessa Windows-1252/CRLF, o vocabulário novo e o banco: `validate-case` passou 30/30.
- O filtro `externalNumber`, a paginação do dobro em memória e a migração `0006_busca_por_numero_do_pedido` existem. O PostgreSQL mostrou as seis migrações aplicadas e os índices por identidade e por número externo.
- Zod está nas fronteiras relevantes: ambiente, requests/responses HTTP, perfis, contrato normalizado, JSONB de conferência e leitura do item de staging. O cursor usa validação manual fechada e tratamento de erro. Não encontrei uma fronteira externa relevante atravessando apenas por coerção TypeScript.
- O Dockerfile usa usuário não root, imagem slim, estágio próprio de migração e poda das dependências opcionais vulneráveis. `docker compose config --quiet` e `docker build --check .` passaram; a imagem em execução confirmou a poda.
- A arquitetura mantém domínio sem Fastify/Prisma e casos de uso por portas. Os achados estão na coordenação transacional e no contrato de paginação, não na separação de camadas.

## Evidências executadas

| Comando/prova                             | Resultado                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `npm run check`                           | passou                                                                      |
| `npm run coverage`                        | 93,30% linhas; 90,13% branches; 88,45% funções                              |
| `npm run test:integration` com API parada | 31/31 no PostgreSQL real                                                    |
| `node scripts/validate-case.mjs`          | 30/30 pela API real                                                         |
| `npm run validate:http`                   | 10/10 pela API real                                                         |
| sonda HTTP de limite deslocado            | falhou como descrito em R14-01                                              |
| `npm run validate:sweep`                  | 20.000 iniciais; 201 páginas; 100 novos em 2 lotes; zero repetidos/perdidos |
| sweep reduzido de 2.000                   | recusou corretamente a prova porque só um lote sobrepôs a leitura           |
| migrações/índices no PostgreSQL           | `0001` a `0006` aplicadas; índice externo presente                          |
| `npm audit --omit=dev --audit-level=high` | quatro altas no grafo opcional/de desenvolvimento do Prisma                 |
| inspeção da imagem runtime                | CLI Prisma, `mysql2` e `deepmerge-ts` ausentes                              |
| Compose/Dockerfile                        | configuração válida; build check sem avisos; API restaurada saudável        |

A primeira tentativa do sweep completo foi descartada porque API e banco foram parados e reiniciados com saída limpa durante a semeadura (`exit=0`, `OOMKilled=false`). A segunda execução completa passou. A suíte de integração trunca as tabelas; a API foi parada antes e restaurada depois, terminando saudável em `/ready`.

## Próximo trabalho recomendado

Criar `FIX-15` com R14-01, R14-02 e R14-03, nesta ordem. A aceitação de R14-01 precisa continuar sendo por HTTP real e deve incluir tanto o deslocamento determinístico do lote quanto a corrida com cabeçalho. Segurança/CI pode ser tarefa separada, pois exige decisão de ambiente e credenciais.

## Arquivos desta revisão

- `docs/handoffs/REVIEW-14-pos-fix-14-final-01-codex.md`
- `docs/TASKS.md`

Alterações preexistentes em `Dockerfile`, `compose.yaml`, `prisma/schema.prisma` e a remoção de `scripts/activate-node.sh` foram preservadas.
