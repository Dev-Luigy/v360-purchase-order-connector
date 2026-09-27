# Handoff: REVIEW-02 — revisão de arquitetura

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: revisão de arquitetura da base contra o enunciado ([CASE.md](../CASE.md)) e as decisões aceitas (ADR-001 a ADR-004). Não é revisão de REVIEW-01, que segue com o Codex. Nada foi corrigido nesta tarefa: são achados para P1-01, P1-02 e ENV-03. Onde digo "hoje" verifiquei no código; onde digo "vai" é risco previsto, não defeito existente.
- Arquivos alterados: nenhum de código. Apenas este registro e o quadro.
- Validação: leitura de `src/`, `tests/`, `compose.yaml`, `Dockerfile`, `package.json`, `tsconfig*.json`; `npm run check` verde; ferramentas do host verificadas (Node 24.21.0, npm 12.1.0, Docker 29.8.1, Compose 5.5.1, daemon sem `sudo`).

## Bloqueia uma exigência explícita do enunciado

**1. `docker compose up` não entrega um sistema utilizável.** O enunciado exige que o avaliador suba serviço e banco com um comando, sem instalar banco. Hoje o Compose sobe a API e um Postgres vazio: não existe runner de migração, o `Dockerfile` não aplica schema e o Compose não tem etapa que o faça. Com Prisma (ADR-004), falta decidir entre `prisma migrate deploy` em entrypoint da API ou um serviço `migrate` no Compose com `depends_on: db healthy`, com a API dependendo dele. No mesmo tema: `prisma generate` precisa rodar no build da imagem e antes de `typecheck`/`build` locais — hoje nem o `Dockerfile` nem `npm run check` têm esse passo, então o primeiro commit com schema quebra os dois.

**2. `/ready` responde 200 com o banco sem schema.** `PostgresHealth.ping()` faz `SELECT 1`: prova conectividade, não prontidão. Com banco vazio, o Compose marca o container como saudável, o avaliador recebe 200 e todo endpoint de negócio responde 500. Readiness precisa verificar estado de migração (última migração aplicada em `_prisma_migrations`, ou existência das tabelas), e o `healthcheck` do Compose herda essa correção de graça.

## Risco alto — decide schema, então precisa sair em P1-01/P1-02

**3. O filtro "apenas os que ainda têm algo a receber" não é expressável no Prisma.** O `where` do Prisma não compara duas colunas, e esse filtro é `quantity_ordered > quantity_received`. Sai caro descobrir isso depois do schema: exige coluna derivada persistida (mantida na aplicação ou generated column do Postgres) com índice, ou `$queryRaw` na consulta mais quente do requisito 1. Além disso, o índice parcial para saldo pendente previsto no [TECHNICAL_PLAN.md](../TECHNICAL_PLAN.md) não é declarável no schema do Prisma: exige SQL manual dentro da migração gerada.

**4. Histórico de conferência versus reingestão.** Se a conferência só referenciar por chave estrangeira os itens que a próxima carga sobrescreve, o histórico muda de sentido retroativamente e o relatório do requisito 3 passa a descrever outra coisa. O enunciado exige que o histórico sobreviva a parada e que o relatório explique motivos. A conferência precisa persistir o retrato do que foi comparado (esperado e recebido, por linha) além da referência, e a versão de ingestão do pedido.

**5. Dinheiro e quantidade.** Quantidade também é decimal — Beta manda `1.200,000` e `KG`, não inteiro. Preço unitário do Gama é dízima na conversão de caixa para unidade (`TRP-09`: R$ 100,00 ÷ 3), então persistir preço unitário arredondado quebra na Parte 2 e força migração. Precisa de `NUMERIC(p,s)` explícito via `@db.Decimal`, política de arredondamento por moeda, e objeto de valor próprio no domínio: `Prisma.Decimal` no domínio viola a regra do `AGENTS.md` de domínio sem banco. A ingestão JSON do Alfa e do Delta não pode passar por `JSON.parse` sem tratar o número como texto.

**6. Ingestão de volume não tem contrato.** "Qualquer volume" e "dezenas de milhares de pedidos em aberto" pedem leitura em streaming, transação por pedido e serialização de cargas do mesmo pedido (advisory lock ou upsert com trava na linha do pedido). Falta a decisão que molda o endpoint: um registro inválido em dez mil rejeita o lote ou aceita o resto e devolve relatório de rejeitados? Sem isso, o contrato de ingestão não pode ser escrito.

## Risco médio

**7. Nenhum teste toca banco.** Os testes trocam a conexão por um substituto: não provam persistência após reinício, filtros com paginação, reingestão nem concorrência — exatamente os quatro itens que o enunciado destaca e que P1-05 exige. Precisa de suíte de integração contra o Postgres do Compose, em script separado, para `npm run check` continuar rodando sem Docker. Relacionado: o glob `tests/*.test.ts` em `package.json` ignora subpastas em silêncio; `tests/adapters/alfa.test.ts` não seria executado e a suíte passaria verde.

**8. Duas pastas de migração e o cliente gerado.** `database/migrations/` está reservada por decisão anterior, enquanto Prisma Migrate usa `prisma/migrations/`. Duas fontes de verdade para schema é ambiguidade a resolver antes da primeira migração. Junto disso: onde o cliente gerado do Prisma fica, se entra no Git ou no `.gitignore`, e como entra em `tsconfig`, `.dockerignore` e `Dockerfile`.

**9. Prisma 7 é recente e vale um spike antes de comprometer o schema.** Generator novo, saída ESM e ausência de engine Rust mudam o setup frente ao Prisma 6, e o projeto é ESM puro com Node 24 e `tsx`. Um schema mínimo com uma tabela, uma migração aplicada e uma consulta paginada custa pouco e evita descobrir incompatibilidade no meio de P1-02.

## Menores

**10.** `query_timeout: 3000` no pool (`src/main/server.ts:8`) é correto para `/ready` e vai estrangular ingestão em lote: separar o caminho de carga do caminho de requisição. **11.** O Compose repete credenciais em `environment` em vez de usar `env_file`, e `DATABASE_URL` existe em dois lugares. **12.** O ESLint usa apenas `recommended`, sem regras type-aware, num projeto que proíbe ponto flutuante para dinheiro — `recommendedTypeChecked` pagaria o custo. **13.** O cursor de paginação não deve expor o ID interno cru: cursor opaco que carrega posição e filtros evita que o cliente combine cursor com outro filtro.

## Pendências e próxima ação

- Pendências herdadas, não tocadas aqui: `docs/SETUP.md` e `docs/STATUS.md` ainda descrevem Docker ausente e Node só em `.tools/node`; ENV-02 está de fato concluída e ENV-03 desbloqueada. `STATUS.md` está reservado por REVIEW-01 e ambiente é frente do Codex.
- Próxima ação: levar os itens 3, 4, 5 e 6 para P1-01 como decisões registradas, e os itens 1, 2, 8 e 9 para P1-02/ENV-03. Os itens 1 e 2 podem ser resolvidos antes de P1-01 se o Codex assumir o ambiente.
- Posse: nenhuma reserva mantida. Este registro não edita código nem os arquivos reservados por REVIEW-01.
- Revisão: não realizada por outro agente.
