# Handoff: FIX-06 — achados de REVIEW-05

- Agente e data: Claude, 2026-09-28.
- Estado: concluída.
- Objetivo e resultado: verificar os onze achados de [REVIEW-05](REVIEW-05-p1-02-codex.md) executando o código, e corrigir os que procedem. **Oito procedem e estão fechados; dois estavam desatualizados; um é lista de notas.**

## Verificação, achado a achado

| #   | Achado                                              | Veredito                                                                         |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Dockerfile não constrói                             | **Desatualizado.** Corrigido em `24f656d`; `docker build --target runtime` passa |
| 2   | Readiness não detecta migração nova                 | **Procede**                                                                      |
| 3   | Ferramenta vulnerável chega ao runtime              | **Procede, e é o pior**                                                          |
| 4   | Índices não batem com a paginação                   | **Procede**                                                                      |
| 5   | Sem testes e check vermelho                         | **Desatualizado.** Check verde e 109 testes desde `24f656d`                      |
| 6   | `CASCADE` apaga histórico                           | **Procede**                                                                      |
| 7   | Sem `CHECK` no banco                                | **Procede**                                                                      |
| 8   | Cursor diverge da ADR-010                           | **Procede**                                                                      |
| 9   | Ordem das divergências não persistida               | **Procede**                                                                      |
| 10  | `prisma format`, `migration_lock`, geração repetida | **Procede**                                                                      |
| 11  | Decisões a confirmar                                | Notas, não defeitos                                                              |

Os dois desatualizados têm explicação: o Codex revisou o commit `7f2aba3` **mais os arquivos não commitados**, ou seja, um retrato no meio do meu trabalho, antes de `24f656d` fechar o Dockerfile, o lint e os testes. O restante ele viu certo.

## O achado 3, que era o mais grave

Confirmado inspecionando a imagem construída, sem executá-la: `mysql2`, `prisma`, `@prisma/engines`, `@prisma/config` e `deepmerge-ts` **estavam na imagem de runtime**. O `mysql2` tem CVE de vazamento de credencial em texto claro, numa aplicação que só fala PostgreSQL e nunca o importa.

A causa é sutil: `@prisma/client` declara o CLI como peer opcional, então ele entra na árvore de produção e `npm prune --omit=dev` não o remove. A correção remove essas árvores no estágio de preparação e **prova dentro do próprio build** que o que sobrou basta, carregando o módulo de acesso a dados num `RUN`. Se a remoção tirar algo necessário, o build falha ali, não em produção.

Resultado: os cinco ausentes, `@prisma/client`, `@prisma/adapter-pg` e `pg` presentes, imagem de 833MB para 733MB. Os 733MB ainda são muito para um serviço Node e merecem uma passada própria.

## As outras correções

- **Índices (4).** Derivados das consultas reais. Entrou `(clientId, id)`, que faltava para "cliente sem status" — `(clientId, status, id)` não serve, o status no meio impede a ordenação direta por `id`. Entrou índice parcial de saldo pendente **sem** recorte por cliente. A conferência trocou `(clientId, checkedAt, id)` por `(clientId, id)` mais `(checkedAt)`, porque a listagem ordena por `id`. Caminhos deliberadamente não indexados estão comentados no schema: cada índice custa escrita em toda ingestão.
- **Histórico (6).** `conference → purchase_order` virou `ON DELETE RESTRICT`. O histórico é imutável por decisão de negócio e o banco não podia oferecer um caminho para apagá-lo.
- **Invariantes (7).** Nove `CHECK`: fator maior que zero, quantidades e preço não negativos, versão de ingestão a partir de um, CNPJ com catorze dígitos, moeda em três maiúsculas, posição não negativa, e a coerência de `quantity_pending` com pedido menos recebido. Saldo negativo continua válido — é recebimento acima do pedido, informação real.
- **Cursor (8).** Passou a ser `{ v, after, f }`, como a ADR-010 escreve. Eu tinha implementado `{ a, f }`: divergência silenciosa de uma decisão aceita, que é exatamente o que as regras do projeto proíbem.
- **Ordem das divergências (9).** Coluna `position`, única por conferência. UUID v7 só garante ordem entre milissegundos diferentes, então ler de volta por `id` não reproduzia a ordem em que as regras de ADR-009 avaliam.
- **Manutenção (10).** `migration_lock.toml` versionado, `prisma format --check` dentro de `npm run check`, e uma geração a menos por ciclo.

A migração `0001` foi **reescrita no lugar**, não sucedida por uma `0002`: nenhum banco a aplicou, então corrigir a primeira é mais barato e não deixa dívida de schema. Depois de ENV-03 isso deixa de ser possível.

## As notas do achado 11, decididas

- **ID do item muda na reingestão.** Consciente: o retrato é substituído. Nenhuma conferência referencia ID de item — ela guarda a nota e a versão do pedido (ADR-009). Se algum dia referenciar, isto vira migração.
- **`hashtext` dá chave de 32 bits.** Colisão serializa pedidos não relacionados, não corrompe dado. Fica assim até haver volume que justifique medir.
- **`ConferenceRepository.save` confia nos campos recebidos.** É responsabilidade de P1-04 construir o registro a partir do pedido carregado, nunca da borda. Anotado como pendência daquela tarefa.
- **Listagem carrega os saldos dos itens da página.** Depende do teto de itens por pedido, que REVIEW-04 deixou em aberto.

## Validação

`npm run check` verde, agora incluindo `prisma format --check`: **114 testes**. `docker build --target runtime` passa com a prova de dependências embutida. Imagem inspecionada por `docker create` + `docker cp`, sem executar container.

**Continua sem validação contra PostgreSQL.** `CHECK`, `RESTRICT`, índices parciais e planos de consulta só se verificam com banco no ar, que é ENV-03. Os repositórios seguem sem teste de comportamento.

## Pendências e próxima ação

- **ENV-03** continua sendo o caminho crítico e depende de autorização para subir o Compose.
- Os 733MB da imagem merecem uma passada de tamanho.
- Posse: reservas de FIX-06 liberadas, inclusive `package.json`.
- Revisão: não realizada.
