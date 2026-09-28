# Handoff: REVIEW-04 — plano de fix de arquitetura, segurança, CI/CD e Docker

- Agente e data: Codex, 2026-09-27.
- Estado: concluída como revisão; nenhuma correção foi aplicada.
- Objetivo: entregar à próxima IA um plano acionável, priorizado e verificável para os riscos encontrados na arquitetura atual e ampliar a análise para segurança, CI/CD e Docker.
- Escopo verificado: código e contratos atuais, `Dockerfile`, `compose.yaml`, arquivos de ambiente, dependências instaladas, ausência/presença de automações de CI e as entregas FIX-04/FIX-05.

## Veredito curto

A separação em domínio, aplicação, infraestrutura, apresentação e composição está coerente. Não há, hoje, dependência invertida entre as camadas. O projeto ainda é, porém, um núcleo de domínio com adaptadores de entrada: persistência e casos de uso de negócio não existem. O risco principal não é reorganizar diretórios, e sim completar P1-02/P1-04 sem perder os limites de memória, transação, autorização e isolamento já desenhados.

Não refazer o que o Claude acabou de entregar:

- FIX-04 tornou a notação numérica específica por natureza do campo, limitou o índice de cabeçalhos do Beta, separou presets de pool e ativou lint com informação de tipos em `src`.
- FIX-05 congelou em runtime os presets compartilhados e os perfis exportados.
- O que segue abaixo é complementar a essas correções.

## Evidências desta revisão

- `npm run check`: verde após FIX-05, segundo o handoff da tarefa, com 97 testes, tipagem, lint, formatação e build.
- `npm audit --audit-level=low`: zero vulnerabilidades conhecidas na consulta ao registro npm em 2026-09-27. É evidência temporal, não garantia futura.
- `npm ls --all`: árvore consistente; dependências opcionais ausentes são as esperadas para plataforma/implementações alternativas.
- `docker compose config --quiet`: configuração válida.
- `docker build --check .`: Dockerfile válido e sem avisos do BuildKit.
- `.env` está ignorado pelo Git e pelo contexto Docker; somente `.env.example` é versionado. Nenhuma chave privada ou arquivo de credencial foi encontrado entre os arquivos rastreados.
- Não existe `.github/workflows/` nem configuração equivalente de CI, atualização automatizada, análise estática de segurança ou scan de imagem.
- Não foi executado `docker compose up`, teste de persistência ou scan de CVEs do sistema operacional da imagem. ENV-03 continua sendo a validação real do ambiente.

## Achados bloqueantes antes de expor as rotas de negócio

### R04-01 — multipart e `SourcePayload` ainda não têm uma ponte segura

**Evidência.** `SourcePayload.parts` recebe fábricas de `AsyncIterable`, enquanto uma requisição multipart entrega fluxos descartáveis e normalmente sequenciais. Alfa usa uma parte, mas Beta precisa de duas e lê cabeçalhos antes de itens. P1-04 ainda não implementou essa borda.

**Risco.** A implementação ingênua tende a acumular os arquivos em memória, tentar reabrir um stream já consumido ou deixar arquivos temporários após cancelamento/erro. Usar o nome fornecido pelo upload também abre caminho para escrita fora do diretório esperado.

**Fix esperado.** Definir antes da rota uma política explícita: spool para diretório temporário exclusivo e nomes gerados pela aplicação, ou redesign do contrato para consumo estritamente sequencial. Nunca usar o nome original como caminho. Aplicar limites por arquivo, por carga, por número de partes e por tempo; cancelar a origem quando o cliente desconectar; remover temporários em `finally` e também na inicialização para resíduos de queda abrupta.

**Critérios de aceite.**

- Um teste com chunks pequenos prova que a carga não é materializada inteira em memória.
- Arquivo acima do teto e parte inesperada são recusados antes de persistir pedidos.
- Cancelamento, parser com erro e falha do repositório fecham streams e removem temporários.
- Nomes como `../../arquivo` nunca influenciam o caminho no disco.
- O teto de disco temporário e a estratégia para múltiplas requisições simultâneas estão documentados.

### R04-02 — streaming de entrada termina em coleções e respostas sem teto

**Evidência.** `IngestionReport` contém todos os `rejected` e `staged`; os schemas aceitam textos e arrays sem comprimento máximo; `csv-stream.ts` não configura tamanho máximo de registro. O parser JSON monta um pedido por vez, mas um único pedido, string ou array de itens pode ser arbitrariamente grande.

**Risco.** Uma entrada hostil ou apenas defeituosa pode consumir memória por uma linha enorme, milhares de itens no mesmo pedido, milhões de rejeições ou uma resposta JSON gigantesca. O batching do adaptador não resolve isso se o caso de uso acumular todo o relatório.

**Fix esperado.** Definir limites de negócio para campos textuais, itens por pedido, linhas de nota, tamanho de registro CSV, tamanho/complexidade de um elemento JSON, bytes por arquivo/carga e quantidade de rejeições devolvidas. Para o relatório, preferir persistir erros e devolver resumo + referência paginável; se isso ficar fora da Parte 1, limitar a amostra devolvida e informar `rejectedTotal` e `rejectedOmitted`.

**Critérios de aceite.**

- Cada limite tem constante/configuração única, erro estável e teste em `limite - 1`, `limite` e `limite + 1`.
- Uma carga inteiramente inválida mantém memória limitada e não produz resposta sem teto.
- Limites da borda HTTP, parser, schema e banco são compatíveis; o banco não é o primeiro lugar a rejeitar tamanho.
- Não se corta silenciosamente nenhum campo, item ou erro.

### R04-03 — autenticação, autorização por cliente e proteção contra abuso não foram decididas

**Evidência.** Hoje só existem `/health` e `/ready`, ambos públicos, o que é aceitável. O contrato futuro inclui ingestão, consulta e conferência, mas não define identidade do chamador, vínculo com `clientId`, rate limit nem concorrência por cliente.

**Risco.** Quando P1-04 expuser as rotas, um chamador poderá consultar ou carregar dados de outro cliente, repetir cargas caras ou saturar CPU, disco temporário e conexões do banco. Confiar apenas no `clientId` da URL não é autorização.

**Fix esperado.** Antes de publicar as rotas, registrar uma decisão de segurança: autenticação de serviço a serviço por OAuth2/JWT, mTLS, chave rotacionável ou proteção comprovada no gateway. A identidade autenticada precisa limitar os clientes acessíveis. Aplicar quota/rate limit e limite de cargas simultâneas por identidade/cliente. Se o desafio deliberadamente deixar autenticação fora do aplicativo, documentar o gateway obrigatório e testar que cabeçalhos de identidade não podem ser forjados diretamente.

**Critérios de aceite.**

- Requisição anônima a rota de negócio falha de forma uniforme; health/readiness seguem a política operacional escolhida.
- Uma credencial de Alfa não consulta, confere nem ingere para Beta.
- Repetição e concorrência acima da quota produzem resposta controlada, sem iniciar trabalho de banco ou spool.
- Segredos de autenticação não aparecem em log, erro ou fixture.

### R04-04 — dados brutos e logs precisam de classificação e retenção

**Evidência.** `StagedRecord.raw` preserva o conteúdo original para reprocessamento. O logger atualmente mascara somente `Authorization`. Consultas futuras podem colocar CNPJ nos parâmetros e erros de ingestão podem carregar valores vindos do cliente.

**Risco.** Payloads comerciais, identificadores, chaves futuras e dados inválidos podem parar em log, relatório, staging ou backup por tempo indefinido.

**Fix esperado.** Classificar o que pode ser logado; nunca registrar corpo completo, `DATABASE_URL`, conteúdo de staging ou cabeçalhos de credencial. Mascarar todos os cabeçalhos de autenticação escolhidos e cookies. Definir acesso, prazo de retenção e remoção de staging/rejeições; limitar também o campo `raw`. TLS deve ser obrigatório fora do ambiente local e o armazenamento deve seguir a política da plataforma.

**Critérios de aceite.**

- Testes de logger comprovam redação de todos os nomes de cabeçalho usados pela autenticação.
- Exceção contendo segredo ou payload não o replica na resposta HTTP.
- Staging tem tamanho máximo, data de expiração e operação de limpeza testada.
- Logs correlacionam requisição/carga por identificador técnico, sem copiar o conteúdo recebido.

## Banco e arquitetura para P1-02/P1-04

### R04-05 — migração, readiness e privilégios ainda não formam uma unidade operacional

P1-02 precisa decidir um único local para migrações (`database/migrations/` ou `prisma/migrations/`), criar runner explícito e fazer `/ready` verificar a versão mínima do schema, não apenas `SELECT 1`. O deploy deve executar migração como etapa separada; a API não deve criar ou alterar schema no start.

Usar credenciais distintas quando sair do ambiente local:

- papel de migração com permissão de DDL;
- papel de runtime somente com DML nas tabelas necessárias;
- TLS configurável/obrigatório fora de desenvolvimento;
- backup e rollback compatíveis com migrações destrutivas.

O preset de ingestão de FIX-04 removeu o limite de consulta. Isso evita matar arbitrariamente uma carga longa, mas também permite espera indefinida. Definir limites finitos e configuráveis para consulta, aquisição de lock e transação ociosa, maiores que os do caminho de requisição, e testar contenção. Não escolher números sem medir a carga de referência.

### R04-06 — casos de uso devem nascer antes das rotas

Criar casos de uso para ingestão, listagem/detalhe, conferência e relatório e injetar apenas portas pequenas. Rotas devem traduzir HTTP, autenticação e schema; adaptadores devem traduzir formatos; repositórios devem cumprir transação e paginação. Não colocar loop de batches, seleção de adaptador, regra de conferência ou codificação de cursor dentro de handlers Fastify.

Para paginação, validar tamanho e estrutura do cursor antes de consultar o banco, vinculá-lo aos filtros e impor comprimento máximo. O conteúdo pode ser opaco para o cliente, mas deve virar estado tipado antes de chegar ao construtor da consulta.

### R04-07 — fronteiras corretas não têm trava automática

A inspeção não encontrou importação proibida, mas o ESLint type-aware de FIX-04 não impede que `domain` passe a importar `infrastructure` ou `presentation`. Adicionar regras de imports restritos ou um teste arquitetural simples, sem introduzir ferramenta nova se o ESLint já bastar.

Critério mínimo: domínio só importa domínio e bibliotecas puras aprovadas; aplicação importa domínio/aplicação; infraestrutura implementa portas; apresentação depende de casos de uso; somente `main` compõe camadas externas.

## Docker

### O que está correto

- Build multi-stage; compiladores e dependências de desenvolvimento não são copiados intencionalmente para o runtime.
- Imagem Node usa versão de patch explícita e variante `slim`.
- Processo final roda como usuário `node`, não como root.
- Arquivos copiados para runtime usam `--chown=node:node`.
- `.env`, `.git`, ferramentas locais, cobertura e `node_modules` não entram no contexto.
- Compose usa `init: true`, healthchecks, volume persistente e publica API/banco somente no loopback.
- Nenhum socket Docker, diretório do host ou segredo real é montado.

### R04-08 — separar claramente Compose local de manifesto de produção

As credenciais `v360/v360`, a publicação do PostgreSQL no host e a rede padrão são aceitáveis apenas para desenvolvimento. Marcar isso explicitamente. Um ambiente implantado não deve publicar o banco, reutilizar essas credenciais nem receber segredo no arquivo versionado.

Para execução endurecida da API, avaliar e testar:

- filesystem somente leitura;
- `cap_drop: [ALL]` e `no-new-privileges`;
- `/tmp` dedicado, com tamanho limitado, se o spool multipart for adotado;
- limites de memória, CPU, PIDs e concorrência;
- período de graça de encerramento compatível com cancelamento/rollback da carga;
- healthcheck também no artefato/manifesto usado fora do Compose local;
- rede em que apenas a API alcance o banco.

Não aplicar as mesmas restrições cegamente ao PostgreSQL: ele precisa escrever no volume e requer validação própria da imagem.

### R04-09 — reprodutibilidade e segurança da imagem não estão automatizadas

Os tags de base não estão presos por digest; `postgres:17-bookworm` ainda flutua dentro da linha principal. Escolher entre digest imutável com atualização automatizada ou tags atualizadas por bot, mas nunca depender de atualização manual invisível. O audit npm não cobre pacotes Debian.

Critérios de aceite:

- build real da imagem no CI a partir do lockfile;
- scan de vulnerabilidades do filesystem e dependências, com política para severidade e exceções expirando;
- SBOM anexado ao release;
- imagem promovida pelo mesmo digest entre ambientes, sem rebuild por ambiente;
- tag pelo SHA do commit; `latest` não é identidade de release;
- idealmente assinatura/proveniência quando houver registry de destino.

## CI/CD

### R04-10 — não existe CI

Criar um pipeline mínimo de pull request:

1. checkout com versão imutável da action e permissões somente de leitura;
2. Node 24, cache indexado pelo `package-lock.json` e `npm ci`;
3. `npm run check`;
4. teste arquitetural e cobertura com limiar explícito;
5. `docker compose config --quiet`;
6. build da imagem;
7. scan de segredo, dependências e imagem;
8. após P1-02, PostgreSQL efêmero, migrações e testes de integração/reinício.

O audit de produção deve ser gate para severidade definida; uma verificação completa pode rodar agendada para também cobrir ferramentas de desenvolvimento. Automatizar atualização de npm, actions e imagens base. PRs de forks não devem receber segredos. Cancelar execução anterior da mesma branch e proteger a branch principal exigindo os checks.

### R04-11 — CD precisa separar build, migração e ativação

Quando houver destino real:

1. `main` gera uma única imagem identificada pelo SHA, SBOM e resultado de scan;
2. ambiente usa credenciais por OIDC/secret manager, nunca segredo de longa duração no repositório;
3. job separado executa migrações com papel próprio e registra a versão;
4. deploy promove o mesmo digest;
5. smoke test verifica `/health`, `/ready` e versão do schema;
6. falha impede promoção e oferece rollback da aplicação; migração incompatível exige estratégia expand/contract ou restauração planejada.

Ambiente de produção deve ter aprovação/proteção própria. Actions de terceiros precisam ser fixadas por SHA completo e receber somente as permissões necessárias.

## Organização e documentação

### R04-12 — documentação principal está atrasada

`README.md` ainda descreve adaptadores como futuros e diz que implementar domínio/adaptadores é a próxima etapa. `STATUS.md` ainda está em FIX-03, embora FIX-04/FIX-05 estejam concluídas. Atualizar ambos em tarefa própria, sem misturar com P1-02.

Os diagramas atuais representam objetos e portas, não a arquitetura de execução. Depois que P1-02/P1-04 existirem, adicionar um diagrama pequeno mostrando HTTP, casos de uso, pools, repositórios, migração e fluxos de arquivos temporários. Não desenhar componentes ainda inexistentes como se estivessem implementados.

`domain/` hoje reúne regras puras, schemas Zod e metadados de integração. Isso é administrável no tamanho atual. Reavaliar submódulos somente quando Gama/Delta aumentarem o acoplamento; uma mudança de pastas agora não corrige nenhum risco operacional.

## Ordem sugerida de execução

1. **P1-02:** schema, migrações, runner, repositórios, privilégios e schema-aware readiness.
2. **SEC-01:** decisão de autenticação/autorização, classificação de dados e limites compartilhados.
3. **P1-04A:** casos de uso sem HTTP, incluindo relatório limitado/persistido e cursor tipado.
4. **P1-04B:** multipart seguro, temporários e rotas com quotas, validação e testes de cancelamento.
5. **CI-01:** pipeline de PR, integração PostgreSQL, build e scans.
6. **OPS-01:** endurecimento do manifesto de implantação, SBOM, migração no deploy e promoção por digest.
7. **DOC-02:** atualizar README/STATUS e diagramar somente a arquitetura realmente entregue.

Não executar tudo em uma única tarefa: P1-02 altera schema/lockfile; P1-04 altera HTTP/composição; CI/Docker e documentação podem ter responsáveis independentes, respeitando as reservas do quadro.

## Checklist final para o marco Parte 1

- `npm run check` verde e cobertura com limiar no CI.
- Audit de dependências e scan da imagem sem achado acima da política, ou exceção documentada com prazo.
- Migrações sobem banco vazio e atualizam banco anterior; runtime não possui DDL.
- Banco reinicia preservando dados e `/ready` falha quando o schema está ausente/desatualizado.
- Ingestão grande mantém memória dentro do teto; cancelamento não deixa stream, transação ou arquivo temporário aberto.
- Autorização por cliente e quotas têm testes negativos.
- Reingestão e concorrência do mesmo pedido preservam identidade, incrementam versão e não produzem retrato parcial.
- Paginação mantém filtros/cursor coerentes sob inserções concorrentes.
- Container roda não-root com limites e sem segredo embutido; imagem é promovida por digest.
- Logs e relatórios não expõem credenciais nem payload bruto fora da política de staging.
- README, STATUS, contrato HTTP e diagramas descrevem o que realmente existe.

## Arquivos que esta revisão alterou

- `docs/handoffs/REVIEW-04-arquitetura-seguranca-cicd-docker-codex.md`
- `docs/TASKS.md`
