# Estado do projeto

Atualizado por Codex em 2026-09-30, após DOCKER-E2E-01.

## Implementado

- Base TypeScript estrita e Fastify, separação de aplicação, infraestrutura, apresentação e composição.
- Interface de disponibilidade do banco e adaptador PostgreSQL.
- `GET /health` e `GET /ready`, validação do ambiente, logs e encerramento gracioso.
- Dockerfile, Compose com PostgreSQL 17 e volume persistente.
- Scripts de desenvolvimento, build, testes, lint e formatação; lockfile presente.
- Contrato normalizado, aritmética decimal e regras puras de conferência.
- Leitura em fluxo e adaptadores Alfa, Beta, Gama e Delta (`nested-json`, `paired-csv`, `flat-json` e `split-json`), com perfis em código.
- Schema Prisma, migração inicial com índices parciais, repositórios de pedido e conferência, prontidão pelo estado das migrações e migração como etapa própria do Compose.
- As seis rotas de negócio: ingestão multipart com spool, consulta com filtros e paginação, detalhe do pedido, conferência e relatório. Contrato em [API.md](API.md).
- Node 24.21.0, dependências npm instaladas e `.env` local criado.
- Guia de colaboração com entrada para ambos os agentes.

## Evidências e limitações

- `npm run check`: **260 testes, 0 falhas** (244 rodam sem banco; 16 são pulados sem `DATABASE_URL`). `npm run test:integration`: **33 testes** contra PostgreSQL real. _(não medida nesta geração)_. Cobertura por `npm run coverage`: **92,80% de linhas, 90,09% de branches** (sem banco; os repositórios PostgreSQL só são medidos com ele no ar). Gerado por `npm run evidence`, não digitado — os números derivaram três vezes quando eram manuais.
- Cobertura **com banco**, por `npm run coverage:db`, que roda também as 34 integrações e exige a API parada: **97,38% de linhas, 88,98% de branches, 94,77% de funções**, com 278 testes e nenhum pulado. A linha acima mede sem banco de propósito, para rodar desassistida em qualquer máquina; até TEST-AUDIT-01 ninguém tinha medido com ele.
- Imagem de runtime construída e inspecionada sem executar container: sem CLI do Prisma e sem `mysql2`, que entrava por peer opcional e trazia CVE de credencial para uma aplicação que só fala PostgreSQL.
- Duas mil combinações aritméticas inteiras comparadas com `BigInt` passaram; `/health` e `/ready` foram exercitados via `inject` nos limites atuais.
- Três revisões registradas — [REVIEW-01](handoffs/REVIEW-01-codex.md), [REVIEW-02](handoffs/REVIEW-02-claude.md) e [REVIEW-03](handoffs/REVIEW-03-codex.md) — e os defeitos inequívocos das três estão fechados em [FIX-01](handoffs/FIX-01-claude.md), [FIX-02](handoffs/FIX-02-claude.md) e [FIX-03](handoffs/FIX-03-claude.md), cada um com regressão. Nenhum achado era falso positivo; dois defeitos adicionais apareceram durante as correções.
- Os quatro pontos que dependiam de decisão foram fechados em [FIX-04](handoffs/FIX-04-claude.md) e registrados em [ADR-012](decisions/ADR-012-notacao-por-campo.md). O workflow de CI e a política de auditoria foram implementados depois em [OPS-01](handoffs/OPS-01-claude.md); ainda não há execução no GitHub Actions.
- **ENV-03 fechou a lacuna que atravessava todo o projeto.** A suíte de integração prova transação, advisory lock sob carga concorrente, os nove `CHECK`, o `RESTRICT` do histórico, a ordem das divergências e a paginação por cursor. Os índices parciais foram confirmados por `EXPLAIN`, não supostos.
- `docker compose up` do zero levanta banco, aplica a migração como etapa própria e só então sobe a API, com `/ready` em 200 — fecha os achados 1 e 2 de [REVIEW-02](handoffs/REVIEW-02-claude.md).
- Persistência de pedidos **e** do histórico de conferências após reinício do banco provada por `scripts/verify-persistence.mjs`.
- Sem `DATABASE_URL`, os testes de integração são pulados: `npm run check` continua funcionando em máquina sem Docker.
- **P2-01 integrou Gama e Delta sem mudar uma coluna** do contrato normalizado. A única migração da Parte 2, `0002_staging_de_itens_orfaos`, não foi para acomodar formato de cliente: fechou a promessa do ADR-008 de reconciliar o item que chega antes do cabeçalho, que estava escrita e não implementada. Detalhe em [P2-01](handoffs/P2-01-claude.md).
- **A aceitação oficial passa pela aplicação de verdade.** Após FIX-18, `npm run validate:http` roda **17 cenários** por `fetch` contra a porta 3000, afirmando status HTTP, corpo do relatório e estado pelas rotas de consulta; inclui as regressões de fechamento sem staging invisível ([REVIEW-18](handoffs/REVIEW-18-validacao-integral-codex.md)).
- **O validador do enunciado é repetível.** Ele dependia de banco recém-limpo e caía para 26/27 na segunda execução: afirmava contagens globais. Agora afirma sobre o conjunto que **ele mesmo** cria e compara o histórico contra uma linha de base. Verificado rodando três vezes seguidas e logo depois de outros scripts, sempre 30/30 (REVIEW-10, R10-05).
- **A varredura é um retrato com fim próprio.** O cursor passou à versão 2 e carrega o teto fixado na primeira página: sem ele, uma varredura sob escrita contínua perseguia o que entrava e não tinha condição de término ([ADR-010](decisions/ADR-010-paginacao.md), atualização de FIX-15). Provado com o escritor ainda ativo depois do fim da varredura.
- **A espera de uma carga em andamento é invisível para outra.** A migração `0007` deu ciclo de vida à linha: ela nasce não publicada e só vira visível quando a carga termina de ler. Sem isso, um cabeçalho concorrente consumia o prefixo de uma carga que depois recusaria o pedido inteiro.
- **A validação contra o enunciado é executável.** `node scripts/validate-case.mjs` faz uma asserção por exigência contra o stack no ar: **30/30**, cobrindo os quatro clientes e as três lacunas que o enunciado deixa em aberto — vocabulário de situação, valor desconhecido e CSV em Windows-1252 com CRLF.
- **Volume medido, não suposto**: 50.000 pedidos e 150.000 itens carregados em 189,3s (264 pedidos/s); varredura de 500 páginas em 1,8s com **zero repetidos**; a última página custa 0,54× a primeira, o que prova o cursor contra `OFFSET`; memória plana em ~380MiB enquanto os pedidos iam de 5 mil a 50 mil.
- Três defeitos encontrados e fechados com regressão: recusa do framework (429, 413) virava 500; o teto de 120 req/min estrangulava a varredura noturna do próprio enunciado; e `docs/API.md` errava **todos** os nomes de parte e o cabeçalho da ingestão, então quem seguisse a documentação não carregava nada.
- `scripts/activate-node.sh` está apagado no working tree por alteração preexistente, preservada nesta revisão. O README deixou de referenciá-lo em DOC-02.

## Limitações e próximos passos

O workflow e a política npm já existem ([OPS-01](handoffs/OPS-01-claude.md)); falta executar o workflow num remoto GitHub. A política mantém quatro avisos altos do grafo de ferramentas do Prisma como exceções temporárias e verifica a mitigação na imagem final. As outras limitações operacionais estão listadas abaixo.

FIX-17 fechou R16-01 e R16-02. REVIEW-17 encontrou R17-01 no caminho em que o fechamento falhava por exceder o limite agregado; FIX-18 passou a descartar essas linhas e mantém o invariante de zero staging não publicado ao fim de uma carga. REVIEW-18 confirmou a correção na integração PostgreSQL e pela rota HTTP ([REVIEW-17](handoffs/REVIEW-17-validacao-pos-fix-17-codex.md), [FIX-18](handoffs/FIX-18-claude.md), [REVIEW-18](handoffs/REVIEW-18-validacao-integral-codex.md)).

**Atualização REVIEW-18:** FIX-18 e CLEAN-02 foram verificados. A integração isolada passou 33/33, incluindo recusa acima de 10.000 itens sem linha não publicada; as rotas passaram 17/17, inclusive esse cenário e o rollback do snapshot anterior. `npm run validate:sweep` percorreu 20.000 pedidos com escrita concorrente sem repetição; os quatro formatos passaram com 20.000 pedidos e 60.000 itens cada. Reiniciar o PostgreSQL descartável preservou os dados; `docker compose config --quiet` e `docker compose build` passaram. Detalhes, limites medidos e escopo dos dados em [REVIEW-18](handoffs/REVIEW-18-validacao-integral-codex.md). Naquele momento faltava política para os quatro avisos altos do grafo Prisma; o fechamento posterior está em [OPS-01](handoffs/OPS-01-claude.md).

**Atualização REVIEW-19 — fidelidade das fixtures:** reenviei os exemplos pelos endpoints de ingestão e conferi o detalhe persistido via consulta da aplicação e SQL direto. Os oito pedidos (Alfa 1, Beta 2, Gama 2 e Delta 3) e seus 11 itens bateram em fornecedor, situação, datas, materiais, unidade, fator, quantidades, saldo pendente e preço decimal. O item Delta sem cabeçalho (`DL-2026-0099`) não virou pedido; foi aceito como staging com os mesmos dados da linha de origem. Havia cinco linhas físicas idênticas dessa referência sob IDs de cargas diferentes, comportamento esperado pelo contrato de coexistência do staging; os testes confirmam que, quando chegar o cabeçalho, a última carga prevalece sem duplicar a linha. Evidência campo a campo em [REVIEW-19](handoffs/REVIEW-19-igualdade-fixtures-banco-codex.md).

**Atualização TEST-RECOVERY-01 — queda e pedidos sem cabeçalho em escala:** a nova integração gera 250 pedidos Delta (766 linhas), mata a API durante staging não publicado, reinicia o processo, confere a limpeza seletiva, reenvia os órfãos e concilia 500 cabeçalhos. O teste compara no PostgreSQL os 1.532 itens resultantes, sem perda ou duplicação. A suíte completa passou 34/34 em banco descartável; detalhes e limites em [TEST-RECOVERY-01](handoffs/TEST-RECOVERY-01-codex.md).

**Atualização DOC-04 — documentação de engenharia:** índice de documentos e guia de leitura adicionados, com diagramas Mermaid de classes/contratos e processos. O guia aponta para as fontes detalhadas existentes sem duplicar contrato HTTP, decisões ADR ou estado das tarefas; veja [DOC-04](handoffs/DOC-04-codex.md).

**Atualização DOCKER-E2E-01 — limpeza e validação do zero:** removidos todos os containers, imagens, volumes e cache BuildKit que existiam no daemon; o volume PostgreSQL anterior (~160 MB) foi apagado a pedido do usuário. Rebuild limpo, sete migrações aplicadas, API e PostgreSQL saudáveis; `/ready` e `/docs` responderam 200. `npm run check` passou (260 testes: 244 aprovados, 16 integrações puladas sem banco); contra o banco recém-criado, integração 34/34, critérios do enunciado 30/30, validação HTTP 17/17, fidelidade 156/156 campos e política de auditoria da imagem aprovados. O Compose está ativo ao final, com novos containers, imagens e volume; ver [DOCKER-E2E-01](handoffs/DOCKER-E2E-01-codex.md).

## Próxima retomada

**As exigências funcionais do enunciado passam para os quatro clientes**: `scripts/validate-case.mjs` ficou em **30/30** e `npm run validate:http` em **17/17**. A Parte 1 está marcada na tag `parte-1`; P2-01 integrou Gama e Delta. R17-01 foi fechado por FIX-18 e confirmado nesta revisão ([REVIEW-17](handoffs/REVIEW-17-validacao-pos-fix-17-codex.md), [FIX-18](handoffs/FIX-18-claude.md), [REVIEW-18](handoffs/REVIEW-18-validacao-integral-codex.md)).

Limitações que P1-05 revelou e deixou abertas: a carga de 50.000 pedidos é uma requisição HTTP de 3,2 minutos, que qualquer balanceador com tempo limite padrão derruba sem retomada; o teto de requisições é por origem e não por identidade, porque não há autenticação; e o teto de página é por origem. Windows-1252 com CRLF **passou a ter fixture ponta a ponta** em FINAL-01 (`tests/fixtures/beta-erp/`).

Limitação operacional adicional: separação de credenciais DDL/DML fora do ambiente local. Consulte o quadro antes de reservar trabalho.

## Colaboração

COL-02 estruturou a memória compartilhada e a leitura sob demanda. Ambos entram por `AGENTS.md`; o mapa está em [COLLABORATION.md](COLLABORATION.md). Resultado e validações: [handoff COL-02](handoffs/COL-02-codex.md).

## Escolhas em discussão

Confirmados pelo usuário: [PostgreSQL, ADR-001](decisions/ADR-001-postgresql.md), [TypeScript + Node.js, ADR-002](decisions/ADR-002-typescript-nodejs.md), [Fastify, ADR-003](decisions/ADR-003-fastify.md), [Prisma ORM 7, ADR-004](decisions/ADR-004-prisma-7.md) e as bibliotecas de P1-03 em [ADR-011](decisions/ADR-011-bibliotecas-p1-03.md). Prisma Migrate foi confirmado operacionalmente em ENV-03 e nas migrações `0001` a `0007`; os limites de campos e decimais estão em `src/domain/limits.ts`.
