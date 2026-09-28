# Handoff: FIX-07 — achados de código de REVIEW-06

- Agente e data: Claude, 2026-09-28.
- Estado: concluída.
- Objetivo e resultado: reproduzir e corrigir os achados de [REVIEW-06](REVIEW-06-pos-fix-06-p1-02-codex.md) que são defeito de código. **R06-01, R06-02 e R06-03 foram reproduzidos por sonda antes da correção e os três procedem.** Junto vieram R06-05 e R06-08, baratos. R06-04, R06-06 e R06-07 ficam fora, pelos motivos no fim.

## R06-01 — contrato e banco sem limite compartilhado

O pior dos três, porque atravessa toda a validação sem ser notado. Reproduzido: o schema Zod aceitava `clientId` com 65 caracteres para uma coluna `VARCHAR(64)`, `material` com 129 para `VARCHAR(128)`, `externalLine` acima do `INTEGER` do PostgreSQL e uma nota com 10.001 linhas. O registro passava por válido e morria na gravação — que em P1-04 viraria 500 em vez de rejeição determinística.

A correção cria `src/domain/limits.ts` como fonte única, aplica os limites nos schemas e **trava a deriva com teste**: o teste lê `prisma/schema.prisma`, extrai cada `@db.VarChar(n)` e compara com a constante. Mudar um lado sem o outro quebra o build.

Entraram também tetos de tamanho que faltavam: itens por pedido e linhas por nota. São números escolhidos, não medidos, e estão comentados como tal — servem para nenhum registro consumir memória sem limite (REVIEW-04, R04-02) e precisam de confirmação com dado real.

E `divergenceSchema`, conferido antes de gravar: `expected` e `received` copiam texto da nota para uma coluna `VARCHAR(512)`.

## R06-02 — prontidão dependia da ordem das linhas

Reproduzido exatamente como descrito: com as mesmas duas linhas, `[revertida, concluída]` respondia **não pronto** e `[concluída, revertida]` respondia **pronto**. Mesma base, veredito diferente, decidido por uma ordem que o PostgreSQL não garante.

A causa é a pergunta errada. Eu perguntava "como está a primeira linha?" quando a pergunta é "existe uma tentativa bem-sucedida?". O fluxo oficial do Prisma permite marcar uma tentativa falha como revertida e aplicar de novo, então a mesma migração fica com duas linhas — caso que eu não tinha considerado. Agora a prontidão procura sucesso, e as outras linhas servem só para explicar o porquê quando não há.

## R06-03 — a impressão digital do cursor colidia

Três colisões confirmadas: `null` com o caractere NUL, o número `1` com a string `"1"`, o booleano `true` com a string `"true"`. Uma impressão que colide não distingue os filtros que ela existe para distinguir — e ela é justamente o que impede combinar cursor de uma consulta com filtro de outra.

Agora a serialização é canônica com tipo explícito, em tuplas `[chave, tipo, valor]` passadas por `JSON.stringify`. Isso fecha de quebra um caso que a revisão não citou: um valor contendo `&` ou `=` podia imitar a forma de outro conjunto de filtros, porque a concatenação usava esses separadores. Tem teste.

## R06-05 — aviso de OpenSSL no estágio de migração

Corrigido e verificado: o pacote `openssl` entra **só no estágio de migração**, e `prisma --version` dentro da imagem passou a resolver `schema-engine-debian-openssl-3.0.x`, sem aviso. A imagem de runtime usa o driver `pg` e não tem esse requisito, então não engorda.

O aviso não tinha se provado fatal, mas migração de schema não é lugar para "provavelmente funciona".

## R06-08 — documentação divergente

README dizia que não havia tabelas nem adaptadores, que `/ready` só verificava conectividade e que a próxima etapa era implementar o domínio. Corrigido, com uma seção nova sobre o que já existe e outra deixando claro que a aplicação ainda expõe só `/health` e `/ready`. `STATUS.md` atualizado. O link quebrado de REVIEW-05 no quadro, que era erro meu, foi consertado.

## Fora de escopo, e por quê

- **R06-04, política de auditoria npm.** O runtime está limpo — verificado dentro da imagem —, mas a árvore do projeto continua vermelha por causa do peer opcional do Prisma. Definir política de severidade aceita, prazo de exceção e gate de CI é decisão, não conserto. `npm audit fix --force` continua propondo downgrade para Prisma 6 e não deve ser executado.
- **R06-06, testes de comportamento dos repositórios.** Depende de ENV-03.
- **R06-07, pipeline de CI.** Tarefa própria, e o desenho já está em REVIEW-04.

## Validação

`npm run check` verde: **122 testes**. Build real dos estágios `runtime` e `migrate`. Imagem de migração inspecionada com execução descartável só para ler a versão do CLI.

**Continua sem PostgreSQL real.** Os `CHECK`, o `RESTRICT`, os índices parciais e o comportamento dos repositórios seguem sem prova executável.

## Pendências e próxima ação

- **ENV-03** é o caminho crítico e depende de autorização para subir o Compose.
- Tarefa de CI e política de auditoria, quando o usuário quiser.
- Os 733MB da imagem de runtime seguem grandes.
- Posse: reservas de FIX-07 liberadas.
- Revisão: não realizada.
