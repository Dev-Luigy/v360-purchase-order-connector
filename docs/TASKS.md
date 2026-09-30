# Quadro de tarefas

Estados: disponível, aguardando, em andamento, em revisão, concluída. Responsável `—` significa que ninguém assumiu.

| ID               | Tarefa                                                           | Estado                         | Responsável | Dependência / escopo                                                                            |
| ---------------- | ---------------------------------------------------------------- | ------------------------------ | ----------- | ----------------------------------------------------------------------------------------------- |
| ENV-01           | Criar base TypeScript/Fastify e Compose                          | concluída                      | Codex       | Arquivos existentes; execução real do Compose pendente em ENV-02                                |
| CLEAN-02         | Concluir a limpeza de comentários no código de produção          | concluída                      | Claude      | 93 referências de review saíram de `src/`; o motivo ficou, a história foi para os handoffs      |
| COL-01           | Organizar colaboração e instalação                               | concluída                      | Codex       | AGENTS.md, CLAUDE.md, docs e link no README                                                     |
| COL-02           | Estruturar contexto compartilhado e leitura sob demanda          | concluída                      | Codex       | Documentação; registro e arquivos abaixo                                                        |
| DOC-01           | Versionar o enunciado e as amostras dos clientes                 | concluída                      | Claude      | Nenhuma; enunciado e fixtures, sem código de negócio                                            |
| DOC-02           | Reestruturar README como artefato avaliado                       | concluída                      | Claude      | As três defesas que o enunciado cobra entraram; destrava a tag parte-1                          |
| DOC-03           | Diagramar objetos e relações do contrato normalizado             | concluída                      | Claude      | P1-01; diagramas em docs/diagrams, sem código de negócio                                        |
| ARCH-04          | Registrar escolha do ORM Prisma 7                                | concluída                      | Codex       | ADR-001, ADR-002 e ADR-003; documentação apenas                                                 |
| ARCH-05          | Registrar desenho de observabilidade (Grafana/Prometheus)        | aceita, implementação diferida | Claude      | Pedido do usuário; decisão apenas, sem dependência instalada                                    |
| ENV-02           | Instalar ferramentas do sistema                                  | concluída                      | Usuário     | Ferramentas instaladas; Docker e Compose verificados em ENV-03                                  |
| ENV-03           | Validar Compose, conexão e reinício do banco                     | concluída                      | Claude      | Compose validado, migração aplicada e 16 testes de integração; destrava P1-05                   |
| ENV-04           | Verificar portas e isolar o Compose antes de subir               | concluída                      | Claude      | Pedido do usuário; preflight, nome fixo do projeto e portas por env                             |
| REPO-01          | Inicializar Git, commit base e fluxo de branches                 | concluída                      | Claude      | Commit base autorizado pelo usuário; docs/GIT_WORKFLOW.md                                       |
| REVIEW-01        | Revisar base e plano técnico                                     | concluída                      | Codex       | Limites de P1-03 e HTTP testados; achados no handoff                                            |
| REVIEW-02        | Revisar arquitetura contra o enunciado                           | concluída                      | Claude      | Achados para P1-01, P1-02 e ENV-03; sem editar código                                           |
| REVIEW-03        | Consolidar verificação pós-FIX-02 para a outra IA                | concluída                      | Codex       | Handoff documental; riscos residuais e retomada                                                 |
| REVIEW-04        | Preparar plano de fix: arquitetura, segurança, CI/CD e Docker    | concluída                      | Codex       | Revisão documental; não altera código nem arquivos reservados por FIX-04/05                     |
| REVIEW-05        | Revisar a entrega parcial de P1-02                               | concluída                      | Codex       | Handoff para Claude; somente documentação                                                       |
| REVIEW-06        | Verificar FIX-06 e funcionalidades concluídas de P1-02           | concluída                      | Codex       | Handoff para Claude; somente documentação                                                       |
| REVIEW-07        | Revisão geral de código, segurança e engenharia                  | concluída                      | Codex       | Código completo, Zod e avaliação de bibliotecas; somente documentação                           |
| REVIEW-08        | Verificar as correções de FIX-08                                 | concluída                      | Codex       | Conferência item a item de REVIEW-07; somente documentação                                      |
| REVIEW-09        | Verificar o projeto após P2-01                                   | concluída                      | Codex       | Oito achados de código/teste e deriva documental; código preservado                             |
| REVIEW-10        | Verificar FIX-10, requisitos e cobertura de cenários             | concluída                      | Codex       | Sete achados; 226 testes integrados, handoff para Claude                                        |
| REVIEW-11        | Verificar as correções de FIX-11                                 | concluída                      | Codex       | Quatro fechados, dois parciais e gerador de evidência inseguro                                  |
| REVIEW-12        | Verificar as correções de FIX-12                                 | concluída                      | Codex       | Dois fechados, um parcial e cinco regressões/lacunas documentadas                               |
| REVIEW-13        | Verificar FIX-13 pelas rotas HTTP reais                          | concluída                      | Codex       | Três fechados, três parciais; quatro falhas reproduzidas via HTTP real                          |
| REVIEW-14        | Verificar FIX-14 e FINAL-01 pela aplicação real                  | concluída                      | Codex       | Falha de staging reproduzida; sweep finito passa, sem teto de snapshot                          |
| REVIEW-15        | Validar FIX-15 do zero contra todo o enunciado                   | concluída                      | Codex       | Aceitação passa; falha fatal vaza staging e publicação perde contabilidade                      |
| REVIEW-16        | Validar FIX-16 integralmente do zero                             | concluída                      | Codex       | Duas falhas residuais reproduzidas; ver handoff                                                 |
| REVIEW-17        | Verificar FIX-17 e repetir regressões de REVIEW-16               | concluída                      | Codex       | R16-01/02 fechados; falha nova de relatório registrada para FIX-18                              |
| OPS-01           | Pipeline de CI e política de exceção da auditoria npm            | em andamento                   | Claude      | Último item aberto; adiado pelo usuário desde o início                                          |
| AUDIT-01         | Provar que o gravado no banco é igual à entrada do enunciado     | concluída                      | Claude      | 156/156 campos batem; Gama recusa data divergente e a nota em jsonb não ganha nem perde campo   |
| REVIEW-18        | Revalidar FIX-18, limpeza e matriz completa de testes            | concluída                      | Codex       | Integração isolada; limites, falhas, volume e persistência aprovados                            |
| REVIEW-19        | Comparar fixtures de entrada com pedidos realmente persistidos   | concluída                      | Codex       | 8 cabeçalhos e 11 itens conferidos; órfão Delta corresponde ao staging                          |
| PORTFOLIO-01     | Documentar contribuição real do responsável pelo projeto         | concluída                      | Codex       | Decisões, critérios de aceite e revisão visíveis no README; autoria de implementação preservada |
| TEST-RECOVERY-01 | Gerar cenários em escala para queda, reenvio e cabeçalho ausente | concluída                      | Codex       | 250 pedidos, 766 linhas e 1.532 itens comparados; PostgreSQL isolado, integração 34/34          |
| FIX-18           | Fechar R17-01: espera invisível após falha ao fechar pedido      | concluída                      | Claude      | Invariante: carga terminada não deixa linha não publicada                                       |
| CLEAN-01         | Enxugar comentários do código estável                            | concluída                      | Codex       | 526 linhas removidas; arquivos ativos de P1-04 preservados                                      |
| P1-01            | Definir contrato normalizado e decisões de negócio               | concluída                      | Claude      | ADR-006 a ADR-010, docs/API.md, tipos e portas; libera P1-02 e P1-03                            |
| P1-02            | Implementar schema, migrações e repositórios                     | concluída                      | Claude      | Código pronto; validação contra PostgreSQL real é ENV-03                                        |
| FIX-06           | Fechar os achados de REVIEW-05 sobre P1-02                       | concluída                      | Claude      | Oito achados fechados; dois estavam desatualizados                                              |
| FIX-07           | Fechar os achados de código de REVIEW-06                         | concluída                      | Claude      | R06-01, 02, 03, 05 e 08 fechados; CI e auditoria ficam para tarefa própria                      |
| FIX-08           | Fechar os achados de código de REVIEW-07                         | concluída                      | Claude      | Seis achados de código fechados; CI, integração e P1-04 seguem fora                             |
| FIX-09           | Corrigir o retrato truncado introduzido em FIX-08                | concluída                      | Claude      | R08-01 a R08-04; regressão atravessando o adaptador                                             |
| P1-03            | Implementar domínio e adaptadores Alfa/Beta                      | concluída                      | Claude      | P1-01; ADR-011; libera P1-04                                                                    |
| FIX-01           | Estabilizar validação e limites de REVIEW-01                     | concluída                      | Claude      | REVIEW-01; sete achados corrigidos com regressão; libera P1-04                                  |
| FIX-02           | Verificação pós-FIX-01: vazamento de origem e notações sem teste | concluída                      | Claude      | Dois defeitos corrigidos; notação por campo fica para decisão                                   |
| FIX-03           | Fechar riscos residuais de REVIEW-02 e REVIEW-03                 | concluída                      | Claude      | Cinco defeitos fechados; quatro decisões listadas em aberto                                     |
| FIX-04           | Fechar os pontos que dependiam de decisão                        | concluída                      | Claude      | ADR-012: notação por campo, teto do Beta, pool por propósito, lint com tipo                     |
| FIX-05           | Congelar presets e perfis exportados                             | concluída                      | Claude      | Preset de pool era mutável por referência; deepFreeze compartilhado                             |
| P1-04            | Integrar API, conferência e relatório paginado                   | concluída                      | Claude      | Seis rotas; validação contra PostgreSQL real é ENV-03                                           |
| P1-05            | Validar desafio e registrar marco parte-1                        | concluída                      | Claude      | 18/18 exigências verificadas no ar; tag depende de DOC-02                                       |
| FIX-17           | Fechar R16-01 e R16-02                                           | concluída                      | Claude      | Conferência estrutural antes de gravar; relatório do próprio fechamento                         |
| FIX-16           | Fechar R15-01, R15-02 e R15-03                                   | concluída                      | Claude      | Fechamento por pedido sob o lock; compensação e varredura de abandono                           |
| FIX-15           | Fechar R14-01, R14-02 e R14-03                                   | concluída                      | Claude      | Ciclo de vida da espera e teto no cursor; 13/13 pelas rotas                                     |
| FINAL-01         | Fechar o enunciado inteiro e entregar a versão final             | concluída                      | Claude      | Seis lacunas fechadas; o dobro em memória não paginava de verdade                               |
| FIX-14           | Fechar REVIEW-13 e provar pela aplicação real                    | concluída                      | Claude      | Carga na identidade física; 10/10 cenários pelas rotas HTTP                                     |
| FIX-13           | Fechar os seis achados de REVIEW-12                              | concluída                      | Claude      | Identidade de carga na espera; emissão de lote centralizada                                     |
| FIX-12           | Fechar os três achados de REVIEW-11                              | concluída                      | Claude      | Guardar e decidir separados; invariante de lote; gerador fail-closed                            |
| FIX-11           | Fechar os sete achados de REVIEW-10                              | concluída                      | Claude      | Sete fechados com regressão; validador agora é repetível                                        |
| FIX-10           | Fechar os nove achados de REVIEW-09                              | concluída                      | Claude      | Nove fechados com regressão, mais três de REVIEW-07 que seguiam abertos                         |
| P2-01            | Integrar Gama/Delta e documentar mudanças                        | concluída                      | Claude      | Os quatro clientes integrados; 27/27 exigências no ar                                           |

Ao assumir tarefa, acrescentar abaixo: ID, responsável, arquivos reservados e dependências. Uma tarefa só pode ter um responsável de implementação por vez.

## REVIEW-01 — revisão da base

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/STATUS.md`, `docs/handoffs/REVIEW-01-codex.md`.
- Escopo: inspeção do código e configuração, checks locais, cobertura e testes exploratórios de limites; nenhum código de produção ou teste do projeto alterado.
- Dependências: persistência real continua dependendo de P1-02 e ENV-03.
- Evidência: [handoff REVIEW-01](handoffs/REVIEW-01-codex.md); `npm run check` verde, cobertura medida e sondas temporárias executadas.

## REVIEW-03 — handoff pós-FIX-02

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/handoffs/REVIEW-03-codex.md`.
- Escopo: consolidar para a outra IA o que foi corrigido, os riscos residuais reproduzidos e a ordem recomendada de retomada; sem editar código.
- Dependências: FIX-01 e FIX-02 concluídas.
- Evidência: [handoff REVIEW-03](handoffs/REVIEW-03-codex.md).

## REVIEW-04 — plano de fix de arquitetura e operação

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/handoffs/REVIEW-04-arquitetura-seguranca-cicd-docker-codex.md`.
- Escopo: consolidar achados de arquitetura e ampliar a revisão para segurança, CI/CD e Docker, com prioridade e critérios de aceite; nenhuma correção de código ou configuração nesta tarefa.
- Dependências: considera FIX-04 e FIX-05 já concluídas para não pedir novamente correções que o Claude acabou de entregar.
- Evidência: [handoff REVIEW-04](handoffs/REVIEW-04-arquitetura-seguranca-cicd-docker-codex.md); `npm run check`, `docker compose config --quiet` e `docker build --check .` verdes; `npm audit --audit-level=low` sem vulnerabilidades conhecidas na data da revisão.

## REVIEW-05 — revisão da entrega parcial de P1-02

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/handoffs/REVIEW-05-p1-02-codex.md`.
- Escopo: revisar schema, migração, dependências, Docker e os repositórios deixados pelo Claude; produzir handoff sem modificar os arquivos de P1-02.
- Dependências: P1-02 permanece formalmente em andamento e seus arquivos continuam pertencendo ao Claude.
- Evidência: [handoff REVIEW-05](handoffs/REVIEW-05-p1-02-codex.md); Prisma validou, mas `npm run check`, `prisma format --check` e o build real do estágio Docker falharam pelos achados documentados; audit registrou quatro vulnerabilidades altas na árvore do Prisma.

## REVIEW-06 — verificação pós-FIX-06 e P1-02

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/handoffs/REVIEW-06-pos-fix-06-p1-02-codex.md`.
- Escopo: conferir no código cada fechamento de REVIEW-05, revisar schema, migração, repositórios, Docker, segurança, documentação e testes; executar validações locais sem subir PostgreSQL nem editar código de produção.
- Dependências: FIX-06 e P1-02 concluídas como código; execução contra PostgreSQL real continua pertencendo a ENV-03 e requer autorização do usuário.
- Evidência: [handoff REVIEW-06](handoffs/REVIEW-06-pos-fix-06-p1-02-codex.md); `npm run check` e builds Docker verdes; 114 testes passaram; três falhas novas reproduzidas e quatro advisories altas ainda presentes na árvore npm.

## REVIEW-07 — revisão geral de código e engenharia

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/handoffs/REVIEW-07-geral-codex.md`.
- Escopo: revisão estática e dinâmica de todo o código existente, fronteiras de validação com Zod, segurança, arquitetura, testes, dependências e oportunidades justificadas de substituir código próprio por bibliotecas; sem alterar produção.
- Dependências: FIX-07 concluída; persistência real continua dependente de ENV-03.
- Evidência: [handoff REVIEW-07](handoffs/REVIEW-07-geral-codex.md); `npm run check` e build runtime verdes, 122 testes, cobertura medida, limites reproduzidos e quatro advisories altas ainda presentes na árvore npm.

## REVIEW-08 — verificação pós-FIX-08

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/handoffs/REVIEW-08-pos-fix-08-codex.md`.
- Escopo: conferir cada fechamento declarado em FIX-08 contra REVIEW-07, executar checks e sondas de regressão, sem alterar código de produção.
- Dependências: FIX-08 concluída; PostgreSQL real continua dependente de ENV-03.
- Evidência: [handoff REVIEW-08](handoffs/REVIEW-08-pos-fix-08-codex.md); seis correções confirmadas, teto de itens ainda produz snapshot truncado, regra de máscara segue parcial e pendências deliberadas continuam abertas.

## REVIEW-09 — verificação pós-P2-01

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md` e `docs/handoffs/REVIEW-09-pos-p2-01-codex.md`.
- Escopo: revisar o estado do repositório, P2-01, arquitetura, contratos, segurança, persistência, testes, documentação e alterações não commitadas; executar checks sem modificar código de produção.
- Dependências: P2-01 concluída; reservas de implementação liberadas.
- Evidência: [handoff REVIEW-09](handoffs/REVIEW-09-pos-p2-01-codex.md); checks verdes, cinco falhas reproduzidas por sonda e quatro lacunas adicionais documentadas.

## REVIEW-10 — verificação pós-FIX-10 e cobertura de cenários

- Responsável: Codex.
- Estado: concluída.
- Arquivos reservados: `docs/TASKS.md` e `docs/handoffs/REVIEW-10-pos-fix-10-codex.md`.
- Escopo: conferir os fechamentos de FIX-10, mapear cada exigência do enunciado para implementação e teste, medir cobertura e procurar cenários de limite ou integração ainda ausentes; sem modificar código de produção.
- Dependências: FIX-10 concluída; reservas de implementação liberadas.
- Evidência: [handoff REVIEW-10](handoffs/REVIEW-10-pos-fix-10-codex.md); `npm run check`, 24/24 integração e 226/226 com cobertura integrada; quatro comportamentos incorretos reproduzidos por sonda.

## REVIEW-11 — verificação pós-FIX-11

- Responsável: Codex.
- Estado: concluída.
- Arquivos reservados: `docs/TASKS.md` e `docs/handoffs/REVIEW-11-pos-fix-11-codex.md`.
- Escopo: conferir no código e por execução cada fechamento R10-01 a R10-07, repetir as sondas adversariais, executar checks e registrar riscos residuais; sem modificar produção.
- Dependências: FIX-11 concluída; reservas de implementação liberadas.
- Evidência: [handoff REVIEW-11](handoffs/REVIEW-11-pos-fix-11-codex.md); checks e 27 testes PostgreSQL verdes, validador 27/27 repetido, mas R10-01 e R10-03 falham entre lotes e `evidence.mjs` não é fail-closed.

## REVIEW-12 — verificação pós-FIX-12

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md` e `docs/handoffs/REVIEW-12-pos-fix-12-codex.md`.
- Escopo: conferir no código e por execução os três fechamentos declarados em FIX-12, repetir as sondas entre lotes e de falha do gerador de evidência e procurar regressões nos limites e na concorrência; sem modificar código de produção.
- Dependências: FIX-12 concluída; reservas de implementação liberadas.
- Evidência: [handoff REVIEW-12](handoffs/REVIEW-12-pos-fix-12-codex.md); cenário original de R10-01 e gerador fechados, R10-03 parcial, cinco achados reproduzidos e checks completos registrados.

## REVIEW-13 — verificação pós-FIX-13 pelas rotas reais

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md` e `docs/handoffs/REVIEW-13-pos-fix-13-http-real-codex.md`.
- Escopo: conferir os seis fechamentos de FIX-13 no código e no PostgreSQL, executar a aplicação e consumir suas rotas HTTP reais com as fixtures Alfa, Beta, Gama e Delta; registrar para Claude critérios de teste sem mocks, `inject` ou chamada direta de repositório.
- Dependências: FIX-13 concluída; reservas de implementação liberadas.
- Evidência: [handoff REVIEW-13](handoffs/REVIEW-13-pos-fix-13-http-real-codex.md); baseline 27/27 pelas rotas reais, mas concorrência na mesma linha, duplicata, teto e reconciliação reproduziram relatórios falsos e perda de item.

## REVIEW-14 — verificação pós-FIX-14 e FINAL-01

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md` e `docs/handoffs/REVIEW-14-pos-fix-14-final-01-codex.md`.
- Escopo: conferir os fechamentos de REVIEW-13 e as funcionalidades adicionadas em FINAL-01, executando checks, PostgreSQL, Compose e as rotas HTTP reais com fixtures e cenários adversariais; sem modificar código de produção.
- Dependências: FIX-14 e FINAL-01 concluídas; reservas de implementação liberadas.
- Evidência: [handoff REVIEW-14](handoffs/REVIEW-14-pos-fix-14-final-01-codex.md); check, 31 integrações, 30/30 do caso, 10/10 HTTP e sweep finito passaram, mas o limite deslocado regrava parte do pedido recusado e o cursor não congela o fim do conjunto.

## REVIEW-15 — validação integral pós-FIX-15 com banco limpo

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/STATUS.md` e `docs/handoffs/REVIEW-15-validacao-integral-pos-fix-15-codex.md`.
- Escopo: apagar os dados do banco do Compose conforme autorização explícita do usuário, reconstruir o estado por migrações e validar todos os requisitos do documento, cenários felizes, falhas, limites, concorrência, persistência, HTTP real, PostgreSQL, Docker e segurança; sem modificar código de produção.
- Dependências: FIX-15 concluída; reservas de implementação liberadas.
- Evidência: [handoff REVIEW-15](handoffs/REVIEW-15-validacao-integral-pos-fix-15-codex.md); banco recriado e entregue vazio, toda aceitação oficial e volume dos quatro formatos passaram, mas duas corridas do ciclo de publicação foram reproduzidas por HTTP/PostgreSQL reais.

## REVIEW-16 — validação integral pós-FIX-16 com banco limpo

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/STATUS.md` e `docs/handoffs/REVIEW-16-validacao-integral-pos-fix-16-codex.md`.
- Escopo: recriar banco e aplicação do zero; executar checks, integração, cobertura, requisitos, rotas, falhas, concorrência, limites, volume nos quatro formatos, persistência, Docker e segurança; reproduzir independentemente R15-01, R15-02 e R15-03; entregar o banco sem dados de negócio.
- Dependências: FIX-16 concluída; autorização explícita do usuário para apagar o banco e executar a matriz completa.
- Evidência: [handoff REVIEW-16](handoffs/REVIEW-16-validacao-integral-pos-fix-16-codex.md); matriz oficial verde e banco entregue vazio, mas payload Alfa truncado persistiu 200 pedidos e uma corrida deixou a carga dona contabilizar 1.999/2.000 registros.

## REVIEW-17 — validação pós-FIX-17

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/STATUS.md` e `docs/handoffs/REVIEW-17-validacao-pos-fix-17-codex.md`.
- Escopo: conferir FIX-17 e repetir `npm run check`, integração PostgreSQL, 30 requisitos, cenários HTTP e reproduções independentes de R16-01/R16-02. Reexecutar varredura concorrente e volume se a versão compilada ou o ambiente tiver mudado. Preservar dados existentes e deixar claro o estado final.
- Dependências: FIX-17 concluída; PostgreSQL/Compose disponível.
- Evidência: [handoff REVIEW-17](handoffs/REVIEW-17-validacao-pos-fix-17-codex.md); check e cobertura passaram, 31/31 integrações, 30/30 requisitos, 16/16 rotas, sweep e quatro volumes passaram; R16-01/02 foram reproduzidos como fechados e R17-01 foi reproduzido no PostgreSQL.

## OPS-01 — CI e política de exceção da auditoria

- Responsável: Claude.
- Estado: em andamento.
- Arquivos reservados: `.github/workflows/ci.yml`, `scripts/audit-policy.mjs`, `security/audit-exceptions.json`, `package.json` (uma linha de script), `README.md` (uma seção), `docs/TASKS.md`, `docs/handoffs/OPS-01-claude.md`.
- Escopo: o único item de peso que faltava, adiado pelo usuário desde o início. Duas entregas: um pipeline que roda o que hoje é rodado à mão, e uma política de auditoria **verificável**, não supressão informal.
- Fato que orienta a política: os quatro avisos altos chegam por `@prisma/client > prisma > {@prisma/config > deepmerge-ts, mysql2}`. `prisma` está na árvore de produção porque `@prisma/client` depende dele, então não é só devDependency. `npm audit fix --force` rebaixaria para `prisma@6.19.3`, quebra de contrato. A imagem final já remove os quatro; conferido com `docker run` contra a imagem construída.
- Critério: a política falha se aparecer aviso novo fora da lista, se uma exceção vencer, ou se a mitigação deixar de valer — ela **confere** a ausência dos pacotes na imagem em vez de afirmar.
- Dependências: nenhuma.

## AUDIT-01 — fidelidade entre a entrada e o banco

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `scripts/audit-fidelity.mjs`, `package.json` (uma linha de script), `docs/TASKS.md`, `docs/handoffs/AUDIT-01-claude.md`.
- Escopo: carregar as quatro amostras do enunciado pelas rotas reais e comparar **campo a campo** o que ficou no PostgreSQL contra o arquivo de entrada. O esperado é derivado à mão do arquivo cru, aplicando as regras escritas em `docs/CASE.md`; nada de `src/` é importado, senão a comparação seria circular. O lido vem por `psql`, não pela API.
- Por que não estava coberto: `validate-case.mjs` prova que cada exigência do enunciado é atendida, e a suíte de integração prova o comportamento do repositório. Nenhuma das duas percorre todos os campos de todos os registros afirmando "este valor é o mesmo que entrou".
- Dependências: Compose ativo.

## REVIEW-18 — validação independente pós-FIX-18/CLEAN-02

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/STATUS.md` e `docs/handoffs/REVIEW-18-validacao-integral-codex.md`.
- Escopo: rever FIX-18 e CLEAN-02; executar checks, cobertura, integração, aceitação HTTP, varredura concorrente, volumes, persistência e configuração/build Docker sem truncar o banco persistente.
- Dependências: FIX-18 e CLEAN-02 concluídas.
- Evidência: [handoff REVIEW-18](handoffs/REVIEW-18-validacao-integral-codex.md); 247 testes sem falhas (16 testes PostgreSQL pulados no `check`), 33/33 integração, 30/30 enunciado, 17/17 HTTP, sweep de 20 mil, quatro volumes de 20 mil, persistência após reinício e build/config Compose aprovados. A auditoria npm continua com quatro vulnerabilidades altas no grafo de ferramentas do Prisma.

## REVIEW-19 — igualdade entre fixtures e dados persistidos

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/STATUS.md` e `docs/handoffs/REVIEW-19-igualdade-fixtures-banco-codex.md`.
- Escopo: reenviar pelas rotas reais as fixtures de Alfa, Beta, Gama e Delta e comparar cada cabeçalho e item devolvido pelo serviço com os valores esperados derivados das entradas; confirmar também o órfão Delta diretamente no PostgreSQL.
- Dependências: API e banco disponíveis.
- Evidência: [handoff REVIEW-19](handoffs/REVIEW-19-igualdade-fixtures-banco-codex.md); 8 pedidos, 11 itens persistidos e a linha DL-2026-0099 em staging coincidem com as entradas e normalizações declaradas.

## PORTFOLIO-01 — contribuição do responsável pelo projeto

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `README.md`, `docs/COLLABORATION.md`, `docs/TASKS.md` e `docs/handoffs/PORTFOLIO-01-contribuicoes-codex.md`.
- Escopo: tornar visíveis as contribuições documentadas do usuário em decisões tecnológicas, priorização/aceitação de critérios e condução de revisões, preservando a atribuição de implementação e validação registrada nos handoffs/Git.
- Dependências: ADR-001 a ADR-004 e ADR-011; handoffs de revisão recentes.
- Evidência: [handoff PORTFOLIO-01](handoffs/PORTFOLIO-01-contribuicoes-codex.md), seção de contribuições no README e responsabilidades esclarecidas em COLLABORATION.

## TEST-RECOVERY-01 — recuperação e pedidos sem cabeçalho em escala

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `tests/integration/recovery.test.ts`, `README.md`, `docs/COLLABORATION.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/handoffs/TEST-RECOVERY-01-codex.md` e `docs/handoffs/PORTFOLIO-01-contribuicoes-codex.md`.
- Escopo: cobrir 250 pedidos Delta gerados com itens sem cabeçalho, morte abrupta e reinício do servidor, remoção de staging não publicado abandonado, preservação da espera publicada, reenvio e reconciliação sem duplicata; comparar todos os itens gerados diretamente no PostgreSQL.
- Dependências: API TypeScript e migrações atuais; rodar integração somente num banco descartável.
- Evidência: [handoff TEST-RECOVERY-01](handoffs/TEST-RECOVERY-01-codex.md); seed fixa `20260930`, morte abrupta (`SIGKILL`) e reinício da API, retenção/expurgo corretos, comparação de 500 cabeçalhos e 1.532 itens no banco. `npm run check` e integração PostgreSQL descartável 34/34 aprovados; banco persistente não usado.

## FIX-18 — espera sem aparecer no relatório após falha

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/application/ports/purchase-order-repository.ts`, `src/application/use-cases/ingest-purchase-orders.ts`, `src/infrastructure/database/purchase-order-repository.ts`, `scripts/validate-fix-14-http.mjs`, `tests/**`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-18-claude.md`.
- Escopo: [R17-01](handoffs/REVIEW-17-validacao-pos-fix-17-codex.md), reproduzido por HTTP: fechar o pedido falha por exceder o agregado, o relatório diz `stagedTotal=0` e fica **1 linha não publicada** no banco. É consequência de FIX-17 ter tirado a recontagem posterior ao fechamento sem cobrir o caminho de falha.
- Decisão: o invariante passa a ser **carga terminada não deixa linha não publicada**. Linha invisível não é "esperando cabeçalho" — ninguém a reconcilia —, então relatá-la seria mentir de outro jeito. Ela é descartada, e o pedido volta como recusa, que é o que o relatório já dizia.
- Dependências: FIX-17 concluída.
- Evidência: [handoff FIX-18](handoffs/FIX-18-claude.md); 247 testes, 33 de integração, 30/30 no enunciado e 17/17 pelas rotas. Depois de carregar 80 mil pedidos, zero linhas não publicadas.

## CLEAN-02 — concluir a limpeza de comentários

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/**` (exceto `src/infrastructure/database/generated/**`), `scripts/validate-case.mjs`, `docs/TASKS.md`, `docs/handoffs/CLEAN-02-claude.md`.
- Reserva estendida durante a tarefa: a revalidação encontrou seis exigências de `scripts/validate-case.mjs` que ainda procuravam o pedido na primeira página de 100. Com os 20.000 pedidos de volume que a rodada de REVIEW-17 deixou no banco, elas falhavam por estado, não por defeito do serviço. Passaram a usar `pedidoDe`, que busca pelo filtro, como as outras já faziam.
- Escopo: aplicar aos arquivos que vieram depois de CLEAN-01 o mesmo critério que ele fixou. O handoff dele avisava para **não reintroduzir número de review nem narrativa de correção em comentário**, e foi exatamente o que eu fiz: 93 ocorrências em `src/`. A regra que fica: a referência vive no **teste e no handoff**; o código de produção enuncia a regra, não a história dela.
- O que permanece, por ser o motivo e não o histórico: precisão decimal e arredondamento, semântica de `items: null` contra `[]`, limites antes da materialização, encerramento de streams, locks e cursor atado aos filtros, invariantes do schema e a poda de dependências no Docker.
- Dependências: CLEAN-01 do Codex, commitado como estava em `ec4849b`, com autoria dele. Conferi que em `prisma/schema.prisma` só saíram comentários.
- Evidência: [handoff CLEAN-02](handoffs/CLEAN-02-claude.md); `npm run check` com 247 testes e zero falhas antes e depois, 33/33 de integração, 30/30 no enunciado **com os 20.000 pedidos de volume no banco** e 17/17 pelas rotas reais.

## CLEAN-01 — limpeza de comentários

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/{conference-rules,conference,decimal,primitives,purchase-order}.ts`, `src/application/ports/{client-profiles,pagination,purchase-order-repository,source-adapter}.ts`, `src/infrastructure/deep-freeze.ts`, `src/infrastructure/database/**`, `src/infrastructure/integrations/{csv-stream,json-stream,nested-json-adapter,paired-csv-adapter,record-mapping}.ts`, `prisma/schema.prisma`, `Dockerfile`, `compose.yaml`, `scripts/{preflight-docker,render-diagrams}.mjs`, `docs/TASKS.md` e `docs/handoffs/CLEAN-01-comentarios-codex.md`.
- Escopo: remover comentários redundantes, históricos de review e explicações que apenas repetem o código; preservar invariantes, decisões de segurança, semânticas de negócio e limitações operacionais não óbvias. Nenhuma alteração de comportamento.
- Dependências: trabalho independente de P1-04; não toca os arquivos reservados ou não commitados do Claude, nem `tests/**`.
- Evidência: [handoff CLEAN-01](handoffs/CLEAN-01-comentarios-codex.md); `npm run check` verde com 139 testes.

## COL-02 — contexto compartilhado e leitura sob demanda

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/COLLABORATION.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/HANDOFF_TEMPLATE.md`, `docs/TECHNICAL_PLAN.md`, `docs/decisions/README.md`, `docs/handoffs/COL-02-codex.md`.
- Escopo: entrada curta comum, mapa de contexto, handoffs objetivos e decisões consultadas por tarefa; sem novas dependências.
- Dependências: nenhuma. Atualizações do quadro e estado executadas sequencialmente por Codex; preservar o registro de REVIEW-01.
- Evidência: [handoff COL-02](handoffs/COL-02-codex.md); `npm run check` passou. Sem revisão de Claude registrada.

## ARCH-01 — registrar escolha do banco

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `README.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/decisions/README.md`, `docs/decisions/ADR-001-postgresql.md`, `docs/handoffs/ARCH-01-codex.md`.
- Escopo: documentar a escolha explícita do usuário; demais ferramentas em discussão. Sem instalação ou alteração de serviços.
- Dependências: nenhuma; edição sequencial dos documentos por Codex, preservando REVIEW-01.
- Evidência: [handoff ARCH-01](handoffs/ARCH-01-codex.md).

## ARCH-02 — registrar linguagem e runtime

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `README.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/decisions/README.md`, `docs/decisions/ADR-002-typescript-nodejs.md`, `docs/handoffs/ARCH-02-codex.md`.
- Escopo: registrar TypeScript e Node.js aceitos pelo usuário; sem alterar código, dependências ou serviços.
- Dependências: nenhuma; atualizações documentais sequenciais por Codex, preservando REVIEW-01.
- Evidência: [handoff ARCH-02](handoffs/ARCH-02-codex.md).

## ARCH-03 — registrar framework HTTP

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `README.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/decisions/README.md`, `docs/decisions/ADR-003-fastify.md`, `docs/handoffs/ARCH-03-codex.md`.
- Escopo: registrar aceite explícito de Fastify; sem alteração de código, dependências ou serviços.
- Dependências: ADR-002; atualização documental sequencial por Codex, preservando REVIEW-01.
- Evidência: [handoff ARCH-03](handoffs/ARCH-03-codex.md).

## ARCH-04 — registrar ORM

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `README.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/decisions/README.md`, `docs/decisions/ADR-004-prisma-7.md`, `docs/handoffs/ARCH-04-codex.md`.
- Escopo: registrar Prisma 7 como ORM aceito pelo usuário; sem instalar dependências ou alterar código.
- Dependências: ADR-001, ADR-002 e ADR-003; preservar a reserva de REVIEW-01.
- Evidência: [handoff ARCH-04](handoffs/ARCH-04-codex.md).

## DOC-01 — enunciado e amostras versionados

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/CASE.md`, `docs/CASE.pdf`, `tests/fixtures/**`, `.prettierignore`, `README.md` (uma linha de link), `docs/TASKS.md`, `docs/handoffs/DOC-01-claude.md`.
- Escopo: transcrever o enunciado para consulta local e reproduzir as amostras dos quatro clientes como fixtures. Sem código de negócio, sem contrato normalizado e sem decisão de regra.
- Dependências: nenhuma. Não toca `docs/STATUS.md` nem os arquivos reservados por REVIEW-01.
- Evidência: [handoff DOC-01](handoffs/DOC-01-claude.md); `npm run check` passou.

## REPO-01 — Git, commit base e fluxo de branches

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/GIT_WORKFLOW.md`, `.gitattributes`, `docs/COLLABORATION.md` (link e duas linhas do mapa), `docs/TASKS.md`, `docs/handoffs/REPO-01-claude.md`.
- Escopo: branch principal `main`, commit base único importando a base existente e convenção de branch por tarefa. Sem alteração de código de aplicação.
- Dependências: autorização explícita do usuário para o commit base, que inclui trabalho do Codex ainda sem revisão registrada.
- Evidência: [handoff REPO-01](handoffs/REPO-01-claude.md).

## REVIEW-02 — revisão de arquitetura

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/handoffs/REVIEW-02-claude.md`, `docs/TASKS.md`.
- Escopo: revisão de arquitetura contra o enunciado e as ADR aceitas; treze achados, nenhuma correção aplicada. Não substitui REVIEW-01, que segue com o Codex.
- Dependências: nenhuma. Não edita código, `docs/STATUS.md` nem arquivos reservados por REVIEW-01.
- Evidência: [handoff REVIEW-02](handoffs/REVIEW-02-claude.md).

## ENV-04 — verificação de portas e isolamento do Compose

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `scripts/preflight-docker.mjs`, `compose.yaml`, `package.json`, `.env.example`, `eslint.config.js`, `README.md`, `docs/TASKS.md`, `docs/handoffs/ENV-04-claude.md`.
- Escopo: verificação antes de subir o Compose, para não colidir com serviço já em execução no host, e isolamento do projeto Docker. Sem código de negócio e sem mexer em `/ready` (mantido por decisão do usuário).
- Dependências: ambiente é frente proposta do Codex em `COLLABORATION.md`; esta tarefa foi pedida explicitamente pelo usuário, que tem prioridade conforme `AGENTS.md`. ENV-03 segue sem responsável; se o Codex assumir, alinhar antes de editar `compose.yaml`.
- Evidência: [handoff ENV-04](handoffs/ENV-04-claude.md); três caminhos do preflight exercitados; `npm run check` verde; Compose real não subido (é ENV-03).

## ARCH-05 — desenho de observabilidade

- Responsável: Claude.
- Estado: concluída como registro; implementação diferida para depois do marco `parte-1`.
- Arquivos alterados (reservas liberadas): `docs/decisions/ADR-005-observabilidade.md`, `docs/decisions/README.md`, `docs/TASKS.md`, `docs/handoffs/ARCH-05-claude.md`.
- Evidência: [handoff ARCH-05](handoffs/ARCH-05-claude.md); `npm run check` verde; nada validado contra Grafana ou Prometheus reais, que não existem nesta máquina.
- Escopo: registrar como a aplicação se conecta a Grafana e Prometheus, o consentimento de quem executa e a convenção de nomes e labels. Nenhuma dependência instalada, nenhum endpoint criado.
- Dependências: nenhuma para o registro. A implementação depende de P1-01 e P1-03, porque os labels saem do contrato e dos adaptadores.

## FIX-17 — atomicidade do documento e relatório da própria carga

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/application/ports/{purchase-order-repository,source-adapter}.ts`, `src/application/use-cases/ingest-purchase-orders.ts`, `src/infrastructure/database/purchase-order-repository.ts`, `src/infrastructure/integrations/{json-stream,csv-stream,nested-json-adapter,paired-csv-adapter,flat-json-adapter,split-json-adapter}.ts`, `docs/decisions/ADR-008-ingestao.md`, `scripts/validate-fix-14-http.mjs`, `tests/**`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-17-claude.md`.
- Escopo: os dois achados de [REVIEW-16](handoffs/REVIEW-16-validacao-integral-pos-fix-16-codex.md), reproduzidos antes de aceitar.
  - **R16-01**: JSON truncado depois de um lote responde **422 sem recibo** e deixa 200 pedidos gravados. O `catch` de FIX-16 limpa a espera e não os retratos.
  - **R16-02**: `finalizeStaged` já devolve `{ waiting }` sob o lock, e o caso de uso ignora — recalcula o relatório com `countStaged`/`sampleStaged` depois de soltar todos os locks. A janela diminuiu, não fechou.
- Decisão de R16-01, tomada por medição: **erro estrutural não muda nada**. A passagem estrutural sobre o payload já em disco custou 0,6s contra 83s da carga de 20.000 pedidos — 1%. Aceitação parcial continua valendo para registro inválido, que sempre devolve recibo; documento truncado é falha de transporte.
- Dependências: FIX-16 concluída.
- Evidência: [handoff FIX-17](handoffs/FIX-17-claude.md); `checkStructure` confere o documento antes de gravar, e o relatório passou a sair do mesmo fechamento que publica as linhas. 16/16 pelas rotas.

## FIX-16 — o ciclo de vida da ingestão, de verdade

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/application/use-cases/ingest-purchase-orders.ts`, `src/application/ports/purchase-order-repository.ts`, `src/infrastructure/database/purchase-order-repository.ts`, `src/presentation/http/problem.ts`, `src/main/server.ts`, `src/domain/limits.ts`, `scripts/validate-fix-14-http.mjs`, `tests/**`, `README.md`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-16-claude.md`.
- Escopo: os achados de [REVIEW-15](handoffs/REVIEW-15-validacao-integral-pos-fix-15-codex.md), reproduzidos antes de aceitar.
  - **R15-01**: JSON truncado depois de um lote responde **500** e deixa linhas não publicadas no banco para sempre. Reproduzido: HTTP 500 e 600 linhas órfãs.
  - **R15-02**: a carga publica **tudo** e só então consolida pedido a pedido; nesse intervalo outro cabeçalho consome linha que ainda pertence ao relatório da carga dona, e ela some da contabilidade.
  - **R15-03**: o 13º cenário do aceite HTTP não exercita o que o nome diz — é falso positivo.
- Os dois primeiros são o mesmo problema: o ciclo de vida da ingestão não existe de fato. Corrigir só a limpeza não fecha a apropriação.
- Dependências: FIX-15 concluída.
- Evidência: [handoff FIX-16](handoffs/FIX-16-claude.md); `finalizeStaged` fecha cada pedido sob o lock dele, publicando e contabilizando na mesma transação. Payload malformado passou de 500 com resíduo para 422 sem resíduo. 14/14 pelas rotas.

## FIX-15 — os três achados técnicos de REVIEW-14

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/application/use-cases/ingest-purchase-orders.ts`, `src/application/ports/purchase-order-repository.ts`, `docs/decisions/ADR-010-paginacao.md`, `src/infrastructure/database/{purchase-order-repository,cursor}.ts`, `prisma/schema.prisma` (só a publicação da espera), `database/migrations/0007_*/**`, `src/infrastructure/database/migrations.ts`, `scripts/{validate-fix-14-http,validate-sweep-under-load}.mjs`, `tests/**`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-15-claude.md`.
- Escopo: os três achados de [REVIEW-14](handoffs/REVIEW-14-pos-fix-14-final-01-codex.md), reproduzidos antes de aceitar.
  - **R14-01** é defeito que introduzi em FINAL-01: o estouro purga o que os lotes anteriores gravaram, mas os itens do mesmo pedido **já percorridos no lote atual** continuam em `aceitos` e são regravados logo depois. O meu validador não pegou porque 10.001 itens consecutivos com lote 200 põem o estouro numa fronteira; deslocar em uma posição quebra. Há também a corrida: um cabeçalho concorrente consome o prefixo antes do estouro.
  - **R14-02**: o cursor só tem limite inferior, então a varredura pode perseguir escrita contínua e não tem condição própria de término. Meu script não prova o contrário, porque o escritor dele é finito.
  - **R14-03**: `recovered` sai da cardinalidade final do retrato e conta itens antigos como recuperados.
- Aceitação: por HTTP real, incluindo o deslocamento determinístico do lote e a corrida com cabeçalho.
- Dependências: FINAL-01 concluída.
- Evidência: [handoff FIX-15](handoffs/FIX-15-claude.md); migração `0007` dá ciclo de vida à espera e o cursor foi para a versão 2 com teto. 13/13 pelas rotas, incluindo o deslocamento de lote e a corrida com cabeçalho que a revisão exigiu.

## FINAL-01 — fechar o enunciado inteiro

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `scripts/**`, `tests/**`, `src/infrastructure/integrations/client-profiles.ts` (se o vocabulário do Beta exigir), `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FINAL-01-claude.md`, `README.md`.
- Escopo: seis exigências do enunciado que **nenhum teste prova hoje**, encontradas relendo `docs/CASE.md` linha a linha em vez de confiar na minha lista:
  1. varredura em lote **enquanto novas cargas entram** — o cenário está escrito no requisito 1 e nunca foi exercitado;
  2. CSV do Beta em Windows-1252 com CRLF, ponta a ponta — o enunciado diz que "uma fixture de variante deveria provar isso" e não existe fixture;
  3. situação `ENCERRADO` do Beta e valor fora do vocabulário, que é suposição nossa registrada;
  4. volume nos formatos do Gama e do Delta — "o serviço deve funcionar para qualquer volume nesses formatos", e só o Beta foi medido;
  5. situações `closed` e `blocked` do Alfa, que a fixture não tem;
  6. robustez dos próprios validadores contra dados de outros scripts.
- Regra desta tarefa, pedida pelo usuário: a cada correção, examinar a vizinhança antes de seguir.
- Dependências: FIX-14 concluída.
- Evidência: [handoff FINAL-01](handoffs/FINAL-01-claude.md); 30/30 no validador do enunciado, volume medido nos quatro formatos, varredura sob carga concorrente e fixture Windows-1252/CRLF ponta a ponta. A regra de examinar a vizinhança rendeu o achado maior: o dobro em memória nunca implementou o cursor, então todo teste de paginação na borda HTTP era vazio.

## FIX-14 — REVIEW-13, com aceitação pela aplicação real

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/application/ports/purchase-order-repository.ts`, `src/application/use-cases/ingest-purchase-orders.ts`, `src/infrastructure/database/purchase-order-repository.ts`, `src/infrastructure/integrations/split-json-adapter.ts`, `prisma/schema.prisma` (só a identidade da espera), `database/migrations/0005_*/**`, `src/infrastructure/database/migrations.ts`, `scripts/validate-fix-14-http.mjs`, `tests/**`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-14-claude.md`.
- Escopo: os quatro achados de [REVIEW-13](handoffs/REVIEW-13-pos-fix-13-http-real-codex.md), confirmados por sonda HTTP contra a aplicação no ar. **R13-04 é perda de dado**: o relatório esconde linhas em espera e a reconciliação seguinte substitui o retrato anterior por elas.
- Causa comum: em FIX-13 eu acrescentei `ingestionId` como coluna, mas a identidade física da linha continuou `(cliente, pedido, linha)` — um campo que o `upsert` sobrescreve não isola nada. E a contagem do relatório saía de subtração entre granularidades diferentes em vez do estado.
- Aceitação: o fix só é declarado concluído com `scripts/validate-fix-14-http.mjs` passando pelas rotas HTTP reais, conforme a instrução registrada no REVIEW-13.
- Dependências: FIX-13 concluída.
- Evidência: [handoff FIX-14](handoffs/FIX-14-claude.md); a migração `0005` põe a carga na identidade física da espera, e `npm run validate:http` prova 10 cenários pelas rotas da aplicação em execução — sem `app.inject`, sem repositório em memória.

## FIX-13 — os seis achados de REVIEW-12

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/application/ports/purchase-order-repository.ts`, `src/application/use-cases/ingest-purchase-orders.ts`, `src/domain/ingestion.ts`, `src/infrastructure/database/purchase-order-repository.ts`, `src/infrastructure/integrations/split-json-adapter.ts`, `prisma/schema.prisma` (só o campo novo), `database/migrations/0004_*/**`, `src/infrastructure/database/migrations.ts`, `tests/**`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-13-claude.md`.
- Escopo: os seis achados de [REVIEW-12](handoffs/REVIEW-12-pos-fix-12-codex.md), todos reproduzidos com sonda. O eixo é R12-02: em FIX-12 eu fiz a tabela de espera acumular a carga sem identidade de ingestão, então duas cargas simultâneas consomem uma a da outra e os dois relatórios mentem. R12-01 e R12-05 saem do mesmo ponto.
- Dependências: FIX-12 concluída.
- Evidência: [handoff FIX-13](handoffs/FIX-13-claude.md); a migração `0004` dá identidade de carga à espera, separando os dois papéis que ela acumulava. A emissão de lotes do Delta foi centralizada num objeto só, então nenhuma saída passa do teto por construção.

## FIX-12 — o que REVIEW-11 mostrou em aberto

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/application/ports/purchase-order-repository.ts`, `src/application/use-cases/ingest-purchase-orders.ts`, `src/domain/{ingestion,limits}.ts`, `src/infrastructure/database/purchase-order-repository.ts`, `src/infrastructure/integrations/split-json-adapter.ts`, `scripts/evidence.mjs`, `tests/**`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-12-claude.md`.
- Escopo: os três achados de [REVIEW-11](handoffs/REVIEW-11-pos-fix-11-codex.md), reproduzidos com sonda. **A correção de R10-03 em FIX-11 criou a lacuna de R10-01**: escoar o staging em lotes fez as linhas do mesmo pedido atravessarem lotes, e o caso de uso agrupava só dentro de um. O gerador de evidência que escrevi para parar de errar números pode publicar número de execução que falhou.
- Dependências: FIX-11 concluída.
- Evidência: [handoff FIX-12](handoffs/FIX-12-claude.md); guardar e decidir viraram operações separadas, então a espera é o acumulador e a transação continua sendo por pedido mesmo com o staging escoando em lotes. O teste de lote passou a afirmar o invariante em vez de um sintoma, e o gerador de evidência ficou fail-closed e com teste.

## FIX-11 — os sete achados de REVIEW-10

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/application/ports/purchase-order-repository.ts`, `src/application/use-cases/ingest-purchase-orders.ts`, `src/infrastructure/database/purchase-order-repository.ts`, `src/infrastructure/integrations/split-json-adapter.ts`, `scripts/validate-case.mjs`, `tests/**`, `README.md`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-11-claude.md`.
- Escopo: os sete achados de [REVIEW-10](handoffs/REVIEW-10-pos-fix-10-codex.md), todos reproduzidos com sonda. **R10-01 é regressão que eu introduzi em FIX-10**: ao dar transação ao item avulso, quebrei a transação por pedido que o ADR-008 decide.
- Dependências: FIX-10 concluída.
- Evidência: [handoff FIX-11](handoffs/FIX-11-claude.md); sete fechados com regressão. `scripts/evidence.mjs` passou a gerar as contagens do STATUS, porque digitá-las falhou três vezes. O validador do enunciado é repetível: 27/27 em três execuções seguidas e logo após a suíte de integração.

## FIX-10 — os nove achados de REVIEW-09

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/application/ports/{purchase-order-repository,staging-repository}.ts`, `src/application/use-cases/ingest-purchase-orders.ts`, `src/domain/{ingestion,staging}.ts`, `src/infrastructure/database/{purchase-order-repository,staging-repository,in-memory-staging,pool,prisma-client}.ts`, `src/infrastructure/integrations/{flat-json-adapter,split-json-adapter}.ts`, `src/infrastructure/integrations/README.md`, `src/main/server.ts`, `tests/**`, `README.md`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-10-claude.md`.
- Escopo: os nove achados de [REVIEW-09](handoffs/REVIEW-09-pos-p2-01-codex.md), todos reproduzidos com sonda antes de aceitar e **nenhum** falso positivo. Três são comentários meus afirmando o que o código não faz.
- Dependências: P2-01 concluída.
- Evidência: [handoff FIX-10](handoffs/FIX-10-claude.md); os nove fechados com regressão, mais R07-04, R07-05 e R07-09, que estavam marcados como critério de P1-04 e não tinham sido fechados. 218 testes, 24 de integração, 27/27 no ar. Migração `0003` acrescentou os `CHECK` que faltavam na conferência.

## P2-01 — Gama e Delta

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/infrastructure/integrations/{flat-json-adapter,split-json-adapter,json-stream,record-mapping,client-profiles,adapter-registry}.ts`, `src/infrastructure/database/{staging-repository,in-memory-staging,migrations}.ts`, `src/application/ports/{staging-repository,source-adapter}.ts`, `src/application/use-cases/ingest-purchase-orders.ts`, `src/domain/ingestion.ts`, `src/main/server.ts`, `src/presentation/http/routes/ingestions.ts`, `prisma/schema.prisma` (só o modelo novo), `database/migrations/0002_staging_de_itens_orfaos/**`, `docs/API.md`, `docs/decisions/ADR-008-ingestao.md`, `README.md`, `tests/**`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/handoffs/P2-01-claude.md`.
- Escopo: Gama (`flat-json`: tudo achatado, timestamp Unix, centavos, situação numérica, quantidade em unidade de compra) e Delta (`split-json`: duas consultas independentes ligadas por `purchase_order`, com staging para item sem cabeçalho). Registrar no README o que foi só adicionar e o que exigiu mexer no que já existia, inclusive migração — o enunciado cobra isso explicitamente.
- Dependências: Parte 1 concluída e marcada com a tag `parte-1`.
- Evidência: [handoff P2-01](handoffs/P2-01-claude.md); 208 testes, 16 de integração e 27/27 exigências do enunciado no ar. O contrato absorveu os dois clientes sem mudar uma coluna; a única migração foi para persistir a espera do Delta, decidida com o usuário.

## P1-01 — contrato normalizado e decisões de negócio

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/decisions/ADR-006-modelo-normalizado.md` a `ADR-010-paginacao.md`, `docs/decisions/README.md`, `docs/API.md`, `src/domain/**`, `src/application/ports/**`, `docs/COLLABORATION.md`, `README.md`, `docs/TASKS.md`, `docs/handoffs/P1-01-claude.md`.
- Escopo: modelo normalizado, identidade, situação canônica, política decimal e de unidade, contrato de ingestão, taxonomia de divergências, paginação e contrato HTTP. Contrato em tipos e portas, sem implementação: adaptadores são P1-03 e schema é P1-02.
- Dependências: nenhuma. Libera P1-02 e P1-03 para trabalho paralelo. Entrada: pontos abertos de `docs/CASE.md` e achados de `docs/handoffs/REVIEW-02-claude.md`.
- Evidência: [handoff P1-01](handoffs/P1-01-claude.md); `npm run check` verde; sem teste novo, porque o entregável é tipo e decisão, não comportamento.

## DOC-02 — README como artefato avaliado

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `README.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/handoffs/DOC-02-claude.md`.
- Escopo: o enunciado cobra explicitamente no README a justificativa de cada regra de conferência, a política de reenvio de pedido alterado e a decisão sobre os dois lados do Delta que não se encontram. Nenhuma das três está lá hoje. A decisão detalhada continua em `decisions/`; o README precisa carregar ou linkar a defesa, e a avaliação inclui defendê-la oralmente.
- Dependências: P1-05 concluída. **Bloqueava a tag `parte-1`**: marcar o marco com o artefato avaliado incompleto seria marcar cedo.
- Evidência: [handoff DOC-02](handoffs/DOC-02-claude.md); as três defesas entraram, mais a da paginação; o README descrevia um projeto de duas semanas atrás e afirmava que só `/health` e `/ready` existiam. Links verificados e cobertura remedida (94,68%, não 94,69%).

## DOC-03 — diagramas de objetos e relacoes

- Responsavel: Claude.
- Estado: concluida.
- Arquivos alterados (reservas liberadas): `docs/diagrams/**`, `scripts/render-diagrams.mjs`, `eslint.config.js` (globais `Buffer` e `fetch` no bloco de `scripts/**`), `docs/COLLABORATION.md` (uma linha do mapa), `README.md` (uma secao curta), `docs/TASKS.md`, `docs/handoffs/DOC-03-claude.md`.
- Escopo: representar em PlantUML os objetos de P1-01 e suas relacoes, com fonte versionada e SVG renderizado. Diagrama derivado do contrato: nao altera tipo, porta nem decisao. O modelo entidade-relacionamento das tabelas pertence a P1-02.
- Dependencias: P1-01 concluida. Nao toca `src/**`, `package.json`, `docs/STATUS.md` nem os arquivos reservados por REVIEW-01.
- Evidencia: [handoff DOC-03](handoffs/DOC-03-claude.md); `npm run check` verde; diagramas renderizados pelo servidor publico do PlantUML e inspecionados visualmente. Sem PlantUML local: nao ha render offline.

## P1-03 — domínio e adaptadores Alfa/Beta

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/decimal.ts`, `src/domain/conference-rules.ts`, `src/domain/schemas.ts`, `src/domain/client.ts` (mapa de campos do perfil), `src/infrastructure/integrations/**`, `tests/*.test.ts` (novos), `package.json` e `package-lock.json` (tres dependencias), `docs/decisions/ADR-011-bibliotecas-p1-03.md`, `docs/decisions/README.md`, `docs/diagrams/**` (regerar), `docs/TASKS.md`, `docs/handoffs/P1-03-claude.md`.
- **Lockfile liberado:** decimal.js, stream-json e csv-parse entraram nesta tarefa, por escolha do usuario registrada em [ADR-011](decisions/ADR-011-bibliotecas-p1-03.md).
- Evidencia: [handoff P1-03](handoffs/P1-03-claude.md); `npm run check` verde com 66 testes; adaptadores exercitados contra as fixtures reais de Alfa e Beta. Nada tocou banco, HTTP ou Docker.
- Escopo: aritmética decimal sem ponto flutuante, as sete regras de conferência de ADR-009, leitores de fluxo JSON e CSV, os adaptadores `nested-json` (Alfa) e `paired-csv` (Beta) e os perfis em código. Implementa o contrato de P1-01 sem alterá-lo.
- Dependências: P1-01. **Não toca** `prisma/`, `src/infrastructure/database/`, `src/presentation/`, `src/main/` nem `package.json`, que são P1-02 e P1-04. Se o Codex assumir P1-02, os dois andam em paralelo; combinar antes de mexer em `package.json`.

## FIX-01 — estabilizar validação e limites

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/{decimal,schemas}.ts`, `src/infrastructure/integrations/{field-parsers,csv-stream,client-profiles,nested-json-adapter,paired-csv-adapter}.ts`, `tests/*.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-01-claude.md`.
- Escopo: os sete achados de [REVIEW-01](handoffs/REVIEW-01-codex.md), cada um com teste de regressão. Corrige o que P1-03 entregou; não acrescenta funcionalidade nem toca contrato de porta.
- Dependências: REVIEW-01 concluída. **Não toca** `prisma/`, `src/infrastructure/database/`, `src/presentation/`, `src/main/` nem `package.json`. P1-02 segue livre para o Codex em paralelo.
- Prioridade adotada, diferente da ordem do handoff: a normalização brasileira permissiva (achado 4) vem primeiro, porque é a única que **altera um valor monetário** em silêncio; as demais aceitam entrada ruim sem mudar número.
- Evidência: [handoff FIX-01](handoffs/FIX-01-claude.md); `npm run check` verde com 81 testes; os sete achados foram reproduzidos antes da correção e um oitavo apareceu durante ela.

## FIX-02 — verificação pós-FIX-01

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/infrastructure/integrations/{json-stream,csv-stream}.ts`, `tests/verificacao-pos-fix-01.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-02-claude.md`.
- Escopo: passada adversarial sobre o que FIX-01 entregou, com cobertura medida. Dois defeitos encontrados nos leitores e as notações que Alfa e Beta não exercitam. Sem mudança de contrato.
- Dependências: FIX-01. Não toca `src/domain/`, `package.json` nem arquivos de P1-02.
- Evidência: [handoff FIX-02](handoffs/FIX-02-claude.md); `npm run check` verde com 86 testes; cobertura 98,07% de linhas e 87,11% de branches. Um problema de contrato ficou registrado sem correção: `numberFormat` é único por cliente e o Gama não cabe nisso.

## FIX-03 — riscos residuais de REVIEW-02 e REVIEW-03

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/{decimal,schemas,conference-rules}.ts`, `src/infrastructure/integrations/field-parsers.ts`, `package.json` (só o script `test`), `docs/STATUS.md`, `tests/*.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-03-claude.md`.
- Escopo: os defeitos inequívocos dos dois reviews — amplificação por expoente antes do schema, identidade de fornecedor comparada com leniência no domínio, máscara híbrida de CNPJ, `isoInstantSchema` só sintático, e o glob de teste que ignora subpastas em silêncio. **Não** resolve o que exige decisão: notação por campo, teto de memória do Beta, `query_timeout` e lint type-aware.
- Dependências: REVIEW-02, REVIEW-03. `package.json` volta a ficar reservado; P1-02 deve aguardar ou alinhar antes de mexer nele.
- Evidência: [handoff FIX-03](handoffs/FIX-03-claude.md); `npm run check` verde com 92 testes; cobertura 98,26% de linhas e 87,08% de branches. `package.json` liberado.

## FIX-04 — pontos que dependiam de decisão

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/client.ts`, `src/infrastructure/integrations/{record-mapping,client-profiles,paired-csv-adapter}.ts`, `src/infrastructure/database/pool.ts` (novo), `src/presentation/http/app.ts` (uma linha), `src/main/server.ts`, `eslint.config.js`, `docs/decisions/ADR-012-notacao-por-campo.md` e o índice, `docs/diagrams/**` (regerar), `tests/*.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-04-claude.md`.
- Escopo: os quatro pontos que FIX-03 deixou abertos por exigirem decisão, autorizados pelo usuário. Muda contrato (`ClientProfile`), então exige ADR e regeração dos diagramas.
- Dependências: FIX-03. `src/main/server.ts` é composição e encosta em P1-02: alinhar se o Codex assumir P1-02 antes do merge.
- Evidência: [handoff FIX-04](handoffs/FIX-04-claude.md) e [ADR-012](decisions/ADR-012-notacao-por-campo.md); `npm run check` verde com 95 testes; perfil sintético com a notação real do Gama passa.

## FIX-05 — congelar presets e perfis exportados

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/infrastructure/database/pool.ts`, `src/infrastructure/integrations/client-profiles.ts`, `tests/fix-04-decisoes.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-05-claude.md`.
- Escopo: `poolOptionsFor` devolvia o preset compartilhado por referência; mutar o retorno corrompia o preset para todo mundo. Mesma classe do perfil mutável de REVIEW-03. Sem mudança de contrato.
- Dependências: FIX-04.
- Evidência: [handoff FIX-05](handoffs/FIX-05-claude.md); `npm run check` verde com 97 testes.

## P1-02 — schema, migrações e repositórios

- Responsável: Claude.
- Estado: concluída como código; validação real pendente em ENV-03.
- Arquivos alterados (reservas liberadas): `prisma/**`, `database/migrations/README.md`, `src/infrastructure/database/**`, `src/application/ports/pagination.ts` (só se o cursor exigir), `package.json` e `package-lock.json` (Prisma 7), `.gitignore`, `Dockerfile`, `compose.yaml`, `tests/*.test.ts`, `docs/TASKS.md`, `docs/handoffs/P1-02-claude.md`.
- Escopo: schema Prisma, migração inicial com os índices que o requisito 1 exige, e as implementações de `PurchaseOrderRepository` e `ConferenceRepository`. Resolve também os achados 1, 2, 3 e 8 de [REVIEW-02](handoffs/REVIEW-02-claude.md).
- Dependências: P1-01 (contrato), ADR-004 (Prisma 7), ADR-012 (pool por propósito). **A validação contra PostgreSQL real é ENV-03** e depende de o usuário autorizar subir o Compose; até lá, migração e consultas não são exercitadas contra banco.
- Nota de posse: `package.json` liberado.
- Evidência: [handoff P1-02](handoffs/P1-02-claude.md); `npm run check` verde com 109 testes; `docker compose config` e `docker build --check` passam. **Nada rodou contra PostgreSQL**: os repositórios não têm teste até ENV-03.

## FIX-06 — achados de REVIEW-05

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `prisma/schema.prisma`, `database/migrations/**`, `src/infrastructure/database/**`, `Dockerfile`, `package.json`, `tests/*.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-06-claude.md`.
- Escopo: os oito achados de [REVIEW-05](handoffs/REVIEW-05-p1-02-codex.md) que verifiquei e procedem. Dois estavam desatualizados — o Codex revisou o commit `7f2aba3` mais arquivos não commitados, antes de `24f656d` fechar o Dockerfile, o lint e os testes.
- Decisão de método: a migração `0001` é **reescrita no lugar**, não sucedida por uma `0002`. Nenhum banco a aplicou ainda, então corrigir a primeira é mais barato e não deixa dívida de schema. Depois de ENV-03 isso deixa de ser possível.
- Dependências: P1-02. `package.json` volta a ficar reservado.
- Evidência: [handoff FIX-06](handoffs/FIX-06-claude.md); `npm run check` verde com 114 testes; imagem de runtime inspecionada sem executar container — `mysql2`, CLI do Prisma e `deepmerge-ts` saíram, 833MB para 733MB. `package.json` liberado.

## FIX-07 — achados de código de REVIEW-06

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/{limits,schemas}.ts`, `src/infrastructure/database/{cursor,schema-readiness}.ts`, `prisma/schema.prisma`, `database/migrations/**`, `Dockerfile`, `tests/*.test.ts`, `README.md`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-07-claude.md`.
- Escopo: R06-01, R06-02, R06-03 e R06-08 de [REVIEW-06](handoffs/REVIEW-06-pos-fix-06-p1-02-codex.md), os três reproduzidos por sonda antes da correção. Mais R06-05, o aviso de OpenSSL no estágio de migração.
- **Fora de escopo, por exigirem decisão:** R06-04 (política de auditoria npm) e R06-07 (pipeline de CI) são tarefa própria; R06-06 depende de ENV-03.
- Dependências: FIX-06.
- Evidência: [handoff FIX-07](handoffs/FIX-07-claude.md); `npm run check` verde com 122 testes; os três achados de código reproduzidos por sonda antes da correção; aviso de OpenSSL confirmado resolvido dentro da imagem de migração.

## FIX-08 — achados de código de REVIEW-07

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/{limits,schemas,decimal}.ts`, `src/infrastructure/integrations/{field-parsers,csv-stream,paired-csv-adapter,client-profiles}.ts`, `prisma/schema.prisma`, `Dockerfile`, `tests/*.test.ts`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-08-claude.md`.
- Escopo: R07-01, R07-02, R07-03, R07-06, R07-07 e R07-08 de [REVIEW-07](handoffs/REVIEW-07-geral-codex.md), todos reproduzidos por sonda antes da correção. Mais o aviso de OpenSSL no estágio de build (parte de R07-10).
- **Fora de escopo, por dependerem de P1-04, de ENV-03 ou de decisão:** R07-04 e R07-09 (agregado da conferência montado pelo caso de uso), R07-05 (parte), R07-10 (CI e política de auditoria), R07-11 (integração com banco), R07-12 (observabilidade e hardening).
- Dependências: FIX-07.
- Evidência: [handoff FIX-08](handoffs/FIX-08-claude.md); `npm run check` verde com 132 testes; os seis achados reproduzidos por sonda antes da correção; build dos dois estágios sem aviso de OpenSSL.

## FIX-09 — retrato truncado e máscara do perfil

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/limits.ts`, `src/infrastructure/integrations/{paired-csv-adapter,field-parsers}.ts`, `package.json` (script de cobertura), `tests/*.test.ts`, `docs/STATUS.md`, `docs/TASKS.md`, `docs/handoffs/FIX-09-claude.md`.
- Escopo: R08-01 a R08-04 de [REVIEW-08](handoffs/REVIEW-08-pos-fix-08-codex.md). **R08-01 é regressão que eu introduzi em FIX-08**: o teto de itens rejeitava a linha excedente e emitia o pedido com as primeiras 10.000, o que `replaceSnapshot` gravaria como retrato completo.
- Escopo adicional, pela mesma causa: qualquer grupo com linha rejeitada emitia retrato parcial, que também apagaria itens conhecidos. A política passa a usar `items: null`, que existe exatamente para isso (ADR-008).
- Dependências: FIX-08.
- Evidência: [handoff FIX-09](handoffs/FIX-09-claude.md); `npm run check` verde com 138 testes; sonda de 10.001 itens agora devolve zero pedidos e uma rejeição.

## P1-04 — casos de uso e rotas de negócio

- Responsável: Claude.
- Estado: concluída como código; validação real pendente em ENV-03.
- Arquivos alterados (reservas liberadas): `src/application/use-cases/**`, `src/presentation/http/**`, `src/main/server.ts`, `src/infrastructure/integrations/{field-parsers,client-profiles}.ts` e `src/domain/client.ts` (política de checksum), `package.json`, `docs/decisions/ADR-013-*.md` e o índice, `docs/API.md`, `tests/**`, `docs/TASKS.md`, `docs/handoffs/P1-04-claude.md`.
- Escopo: as quatro entregas do enunciado, **uma rota por vez** — caso de uso, rota e teste antes da próxima —, por escolha do usuário. Ordem pela dependência real: ingestão, consulta, conferência, relatório. Conferir exige pedido carregado, que exige ingestão.
- Decisões do usuário nesta tarefa: manter o invólucro do `Decimal`; adotar `cpf-cnpj-validator` com o checksum como política por perfil; instalar provider Zod, multipart, rate-limit e fast-check.
- Dependências: P1-02 e P1-03. A validação contra PostgreSQL real continua sendo ENV-03.
- Evidência: [handoff P1-04](handoffs/P1-04-claude.md); `npm run check` verde com 169 testes; cobertura 94,69% de linhas e 89,50% de branches. As seis rotas existem e são exercitadas por `inject`, com repositório em memória — **nada rodou contra PostgreSQL**.

## ENV-03 — Compose, banco real e suíte de integração

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `tests/integration/**`, `package.json` (script da suíte), `compose.yaml` e `.env.example` se a validação exigir, `docs/TASKS.md`, `docs/STATUS.md`, `docs/handoffs/ENV-03-claude.md`.
- Escopo: subir o Compose, aplicar a migração, escrever a suíte que prova o que nenhum teste unitário alcança — transação, advisory lock em carga concorrente, `CHECK`, `RESTRICT`, paginação por cursor, persistência após reinício do banco — e medir o plano das consultas quentes com `EXPLAIN`.
- Autorização: o usuário liberou explicitamente subir serviço e mexer no banco, o que o `AGENTS.md` reservava a ele.
- Dependências: P1-02 e P1-04. Fecha R07-11 e destrava P1-05.
- Evidência: [handoff ENV-03](handoffs/ENV-03-claude.md); `npm run test:integration` com 16 testes estáveis em quatro execuções; `docker compose up` do zero levanta banco, migração e API, com `/ready` em 200; persistência de pedidos e histórico provada por `scripts/verify-persistence.mjs`; índices confirmados por `EXPLAIN`.

## P1-05 — validar o desafio e marcar a Parte 1

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `scripts/{validate-case,volume-check}.mjs`, `tests/{p1-05-volume,contrato-documentado}.test.ts`, `tests/support/build-test-app.ts`, `src/presentation/http/{app,problem}.ts`, `src/infrastructure/config/env.ts`, `src/main/server.ts`, `eslint.config.js`, `docs/API.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/handoffs/P1-05-claude.md`.
- Escopo: conferir o sistema contra cada exigência do enunciado, medindo em vez de supor — persistência, concorrência, precisão decimal, paginação com filtros e **volume**, que é o item que nenhuma tarefa anterior exercitou. Registrar o que falta antes da tag.
- Dependências: P1-04 e ENV-03. Antecede DOC-02 e a tag `parte-1`.
- Evidência: [handoff P1-05](handoffs/P1-05-claude.md); 18/18 exigências verificadas contra o serviço no ar, 50.000 pedidos medidos, três defeitos corrigidos com regressão. A tag `parte-1` **não** foi marcada: depende de DOC-02, porque o enunciado trata o README como artefato avaliado.
