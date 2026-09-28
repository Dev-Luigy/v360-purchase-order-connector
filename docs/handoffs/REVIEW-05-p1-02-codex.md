# Handoff: REVIEW-05 — revisão da entrega parcial de P1-02

- Agente e data: Codex, 2026-09-27.
- Estado: revisão concluída; nenhuma correção aplicada aos arquivos do Claude.
- Escopo revisado: commit `7f2aba3` e os arquivos não commitados deixados em `src/infrastructure/database/`, `package.json` e `package-lock.json`.
- Situação da tarefa revisada: P1-02 continua marcada como em andamento e ainda não tem handoff próprio.

## Veredito

A base é boa: schema e migração representam o contrato normalizado, o repositório usa transação e advisory lock por pedido, os decimais não passam por `number`, o cursor é validado antes da consulta e conferência/itens são gravados atomicamente. A entrega, contudo, não está pronta para concluir P1-02. Há falhas confirmadas no Docker, readiness, índices, dependências e checks, além de ausência total de testes para o código novo.

## Evidências executadas

- `npm run check`: **falhou** em `src/infrastructure/database/cursor.ts:43`, regra `@typescript-eslint/no-base-to-string`.
- `npm exec prisma validate`: passou.
- `npm exec prisma format -- --check`: **falhou**, schema Prisma não formatado.
- `docker build --progress=plain --target build .`: **falhou** porque o Dockerfile não copia `prisma.config.ts` nem `prisma/schema.prisma` antes de `npm run build` disparar `prisma generate`. O build também alertou ausência de OpenSSL na imagem `slim`.
- `docker build --check .`: passou, mostrando que a verificação estática não detecta a quebra do build real.
- `npm audit --audit-level=low`: quatro vulnerabilidades altas nas dependências transitivas do Prisma CLI (`deepmerge-ts` e `mysql2`).
- `npm audit --omit=dev`: também reportou as quatro.
- `npm ls --omit=dev prisma @prisma/config mysql2 deepmerge-ts`: mostrou o Prisma CLI na árvore de produção por meio do peer opcional de `@prisma/client`.
- `npm prune --omit=dev --dry-run --json`: não incluiu `prisma`, `mysql2` ou `deepmerge-ts` na lista de remoção.
- Busca na suíte: nenhum teste novo referencia cursor, mapeamento, repositórios, Prisma ou `SchemaReadiness`.
- PostgreSQL real e migrações não foram executados; isso continua dependendo de ENV-03.

## Achados

### 1. Alto — o Dockerfile não constrói depois da entrada do Prisma

O Dockerfile copia `package*.json`, `tsconfig*.json` e `src`, mas o `prebuild` agora executa `prisma generate`. Dentro do build não existem o config nem o schema, e a construção para com “Could not find Prisma Schema”.

**Correção esperada:** copiar `prisma.config.ts` e `prisma/` antes da geração; decidir quais migrações/configurações entram no estágio/job de migração; resolver o requisito de OpenSSL da ferramenta Prisma na imagem que executará geração/migração. Repetir o build completo, não apenas `docker build --check`.

### 2. Alto — `SchemaReadiness` não detecta migração nova ainda não aplicada

O código considera o schema pronto quando existe ao menos uma linha aplicada em `_prisma_migrations` e não há linha inacabada. Migração ainda não executada não aparece nessa tabela. Portanto, quando surgir `0002`, um banco apenas com `0001` continuará respondendo pronto.

`rolled_back_at IS NOT NULL` também significa migração marcada como revertida, não necessariamente “falha ativa”; migração que falhou costuma ser percebida por `finished_at IS NULL` e seus logs. A consulta atual falha de forma conservadora nesse caso, mas a nomenclatura está incorreta.

**Correção esperada:** versionar no artefato a última migração obrigatória e verificar que ela está aplicada com sucesso, ou verificar explicitamente objetos/colunas mínimas do schema. Adicionar teste para banco vazio, somente migração antiga, migração corrente, migração inacabada e tabela de controle ausente.

### 3. Alto — ferramentas vulneráveis permanecem candidatas ao runtime

O Prisma 7.10.0 introduziu quatro alertas altos. Embora `prisma` esteja em `devDependencies`, o peer opcional de `@prisma/client` mantém o CLI e suas dependências na árvore exibida com `--omit=dev`; o dry-run do prune não os remove.

O projeto usa PostgreSQL, mas pode carregar `mysql2` vulnerável na imagem final apenas por causa do CLI.

**Correção esperada:** separar geração/migração do runtime e provar, inspecionando o estágio final, que Prisma CLI, `mysql2`, compiladores e ferramentas não estão presentes. Não executar `npm audit fix --force`, pois ele propõe downgrade incompatível para Prisma 6. Se não houver release corrigida compatível, documentar a exceção temporal e acompanhar upstream; o runtime não deve conter a dependência não usada.

### 4. Alto — índices não correspondem à paginação implementada

O repositório filtra combinações opcionais e sempre ordena por `id`. O plano e ADR-010 pedem índices sobre `(filtros, id)`, mas o schema tem `(clientId, status, id)` no lugar de `(clientId, id)` e não possui `(status, id)`.

- Cliente sem status: o status intermediário impede que o índice entregue diretamente a ordenação global por `id` daquele cliente.
- Status sem cliente: não há índice alinhado.
- `onlyPending=true` sem cliente/fornecedor: os índices parciais existentes começam por cliente ou fornecedor.
- Conferências também ordenam por `id`, mas o índice intercala `checkedAt` entre cliente e `id`.

**Correção esperada:** derivar os índices das consultas reais, incluir os caminhos mínimos prometidos no plano e validar com `EXPLAIN (ANALYZE, BUFFERS)` após ENV-03. Não tentar criar índice para toda combinação; selecionar os caminhos quentes e documentar os demais.

### 5. Alto — código novo não tem testes e o check está vermelho

Não há regressão para:

- transação/reingestão e preservação de identidade;
- `items: null` versus `items: []`;
- serialização concorrente do mesmo pedido;
- cálculo de saldo e `hasPendingBalance`;
- paginação, `limit + 1`, filtros e cursores inválidos;
- persistência e ordenação de divergências;
- resumo por nota versus ocorrência;
- readiness de schema;
- conversão de datas/decimais.

O lint já encontrou um problema no fingerprint do cursor. P1-02 não deve ser marcada como concluída com `npm run check` vermelho. Testes unitários podem cobrir cursor/mapeamento/readiness; comportamento transacional e planos de consulta exigem PostgreSQL real em ENV-03.

### 6. Médio — exclusão de pedido apaga histórico imutável

A FK `conference -> purchase_order` usa `ON DELETE CASCADE`. A decisão de negócio diz que o histórico de conferência é imutável. Mesmo que não exista método de exclusão no repositório, o banco permite apagar todo o histórico junto com o pedido.

**Correção esperada:** usar `RESTRICT`/`NO ACTION` para conferências. Cascade continua apropriado de conferência para divergências e, conforme a política escolhida, de pedido para itens.

### 7. Médio — invariantes dependem somente da aplicação

A migração aceita diretamente fator de conversão zero/negativo, quantidades inválidas, versão de ingestão menor que um, CNPJ não numérico e moeda fora do formato canônico. Também não protege a coerência de `quantity_pending` com as quantidades originais.

**Correção esperada:** adicionar `CHECK` para invariantes locais essenciais que o PostgreSQL consegue garantir. A coerência de `has_pending_balance` com várias linhas continua responsabilidade da transação do repositório e precisa de teste.

### 8. Médio — cursor diverge da ADR e seu fingerprint não é canônico o bastante

A ADR-010 define payload versionado `{ v, after, f }`; a implementação grava apenas `{ a, f }`. Sem versão, mudar o formato do cursor no futuro não tem caminho explícito de compatibilidade ou rejeição.

O fingerprint concatena `String(value)` e já falha no lint type-aware. Nos filtros atuais os valores são primitivos, mas a função aceita `unknown`, conflui `null` com string vazia e não define serialização por tipo.

**Correção esperada:** usar payload versionado e serialização canônica de valores permitidos, rejeitando tipo inesperado. Testar tamanho, alfabeto, JSON inválido, UUID inválido, versão desconhecida, filtro alterado e cursor válido.

### 9. Médio — ordem das divergências não é persistida

As divergências são criadas em uma ordem semântica pelas regras, mas a tabela não possui posição. Na leitura, o repositório ordena por UUID v7. Várias divergências criadas na mesma operação não têm garantia documental de que a ordem por UUID reproduza a ordem do array original.

**Correção esperada:** persistir um ordinal (`position`) e usar `(conference_id, position)` como unicidade/ordenação, ou registrar formalmente que a ordem não faz parte do contrato e tornar testes/API independentes dela. A primeira opção preserva melhor o comportamento atual do domínio.

### 10. Médio/baixo — manutenção da migração ainda não fechou

- `prisma format --check` falha e não faz parte de `npm run check`.
- `database/migrations/README.md` ainda afirma que não existem migrações.
- Não existe `migration_lock.toml`; confirmar pelo fluxo oficial do Prisma 7 se ele deve ser versionado no caminho customizado antes do primeiro deploy.
- Índices parciais escritos manualmente não aparecem no schema Prisma. Validar que uma segunda migração não tente removê-los nem reporte drift inesperado.
- `prisma generate` roda até três vezes dentro de `npm run check` por causa de `pretypecheck`, `pretest` e `prebuild`; é correto, mas desnecessariamente caro.

### 11. Baixo — decisões a confirmar nos repositórios

- Reingestão apaga e recria itens; o ID interno do item muda mesmo quando `(purchaseOrderId, externalLine)` é o mesmo. Hoje nenhuma conferência referencia o ID do item, mas a política precisa ser consciente.
- `hashtext` fornece chave de advisory lock de 32 bits. Colisão não corrompe dados, mas serializa pedidos não relacionados. Avaliar chave de 64 bits se o volume justificar.
- `ConferenceRepository.save` confia que `clientId`, pedido e versão correspondem; a futura camada de aplicação deve construir o registro a partir do pedido carregado, não aceitar esses campos livres da borda.
- Listar pedidos carrega os saldos de todos os itens dos cem pedidos para calcular duas contagens. É correto, mas o custo depende do teto de itens por pedido, ainda indefinido em REVIEW-04.

## Pontos positivos

- Prisma está isolado em infraestrutura; domínio e portas não importam ORM.
- `@prisma/adapter-pg` reutiliza os pools por propósito de ADR-012.
- Advisory lock de transação serializa inclusive criação concorrente do mesmo pedido.
- `items: null` preserva itens e `[]` remove, como decidido.
- `quantityPending` é calculado com decimal exato e `hasPendingBalance` é atualizado na mesma transação.
- Reingestão preserva ID do pedido e incrementa a versão.
- Cursor tem limite de tamanho, valida base64url/JSON/UUID e vincula filtros.
- Listagens usam `limit + 1`, sem `COUNT` total.
- Conferência e divergências são criadas atomicamente via nested write.
- JSON da nota é validado novamente ao sair do banco.
- Resumo diferencia notas e ocorrências de divergência.
- O schema usa unicidades corretas, `NUMERIC(30,6)`, UUID v7 e índices parciais explícitos.

## Ordem recomendada ao Claude

1. Fazer `npm run check` voltar a verde e adicionar testes unitários do código novo.
2. Corrigir o Dockerfile e provar build completo; inspecionar dependências do estágio runtime.
3. Corrigir readiness para versão esperada do schema.
4. Ajustar índices, integridade do histórico e constraints antes de aplicar a primeira migração real — é mais barato corrigir `0001` enquanto nenhum banco foi validado.
5. Fechar cursor versionado e ordem das divergências.
6. Adicionar runner de migração no Compose e só então executar ENV-03, testes concorrentes e `EXPLAIN`.
7. Atualizar README da migração, STATUS e handoff de P1-02 após todas as evidências.

## Arquivos alterados por esta revisão

- `docs/handoffs/REVIEW-05-p1-02-codex.md`
- `docs/TASKS.md`
