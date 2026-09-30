# TEST-AUDIT-01 — auditoria de cobertura, bordas, integração e deploy

- Responsável: Claude, 2026-09-30.
- Estado: concluída.
- Pedido do usuário: verificar se os testes olham todos os cenários possíveis, as bordas, a integração e o deploy — "quero saber que está tudo perfeitamente desenvolvido".

## Resposta curta

Não estava. Estava perto, e três coisas reais apareceram: uma de **método** (a cobertura era medida errado), uma de **borda latente** (um teto de transação que o ADR prometia e ninguém tinha declarado) e uma de **cobertura** (dois limites sem teste nenhum). As três foram corrigidas e provadas.

## Achado 1 — ninguém nunca tinha medido a cobertura com banco

Sejamos precisos, porque na primeira redação eu exagerei: a linha publicada **sempre disse** "sem banco; os repositórios PostgreSQL só são medidos com ele no ar". A medição não mentia. O que não existia era o outro número — ninguém tinha rodado a cobertura com o banco no ar, então a cobertura real do projeto era desconhecida.

`npm run coverage` não carrega `.env`, então a suíte de integração é pulada. O efeito é que os repositórios PostgreSQL aparecem assim:

```text
purchase-order-repository.ts   linhas 54,68
conference-repository.ts       linhas 55,91
```

Não porque não fossem testados — são, por 34 testes de integração — mas porque a medição não os executava.

Medido com banco, com a mesma suíte: **97,38% de linhas, 88,98% de branches, 94,77% de funções**, com 278 testes e nenhum pulado.

Corrigido com dois scripts em vez de um. Primeiro mudei o `coverage` para carregar `.env`, e isso **quebrou o `npm run evidence`**: a suíte de integração dá `TRUNCATE` e exige a API parada, então o gerador de evidência deixou de rodar desassistido. Desfiz. `coverage` continua sem banco, rápido e sem exigir exclusividade; `coverage:db` é o que mede com ele. O STATUS passou a registrar os dois números, dizendo qual é qual.

## Achado 2 — o ADR-012 prometia transação longa e o Prisma cortava em 5s

Medir a cobertura com banco fez um teste de integração falhar:

```text
✖ consolidação acima do teto de itens recusa em vez de gravar
  Transaction API error: A query cannot be executed on an expired transaction.
  The timeout for this transaction was 5000 ms, however 5006 ms passed.
```

A causa não é a instrumentação. O preset `ingestion` do pool eleva `statement_timeout` e `query_timeout` para 300s, e o ADR-012 diz, com essas palavras, que o caminho de carga "aceita transação longa mas finita". Mas o **teto de transação interativa do Prisma** é um mecanismo diferente dos tempos do PostgreSQL, vale 5s por padrão e nunca foi passado a nenhum dos três `$transaction`.

É a mesma classe que já mordeu este projeto antes — a de coisa declarada e não implementada, como o preset de ingestão que existia e nada usava.

**Quanto isso estava perto de morder.** Sondei os caminhos no limite documentado pela rota real, com 10.000 itens num pedido:

| Caminho                                                    | Tempo |
| ---------------------------------------------------------- | ----: |
| Alfa, pedido novo com 10.000 itens (`replaceSnapshot`)     | 2,4 s |
| Delta, 10.000 itens consolidados sobre cabeçalho existente | 6,4 s |
| Delta, reenvio dos 10.000 sobre pedido que já tinha 10.000 | 6,4 s |
| Alfa, reenvio completo dos 10.000                          | 2,1 s |

Nenhum estourou aqui — as transações individuais ficaram abaixo dos 5s. Mas a folga é da máquina, não do desenho, e o estouro chega como `erro_interno` 500, sem dizer o que houve.

Corrigido: `transactionTimeoutMs` por propósito em `pool.ts`, 5s para requisição e 120s para carga, passado às três escritas. O valor fica **abaixo** do `statement_timeout` de propósito — quem decide o fim é o PostgreSQL, com a transação já desfeita, e não um cancelamento do cliente sobre uma transação ainda aberta no servidor.

A prova de que a correção é real: a mesma medição de cobertura que falhava passou a dar **278 testes, 0 falhas, 0 pulados**.

## Achado 3 — duas bordas sem teste nenhum

Varri os dezenove limites do domínio contra os testes. Dezessete são exercitados. Dois não eram:

- **`maxCursorLength`** (256). Funciona: cursor de 300 caracteres responde `400 requisicao_invalida`, antes de qualquer decodificação.
- **`maxStagedRawCharacters`** (8 KiB). Funciona, e é alcançável: `raw` guarda o objeto **de origem**, não o item validado, então um campo fora do contrato entra inteiro. Enviei um item com 50 KB de lixo num campo extra e o banco guardou exatamente 8192 caracteres.

Os dois estavam certos. O problema é que apagar qualquer uma das duas guardas não deixaria nada vermelho.

Corrigido: `tests/bordas.test.ts`, seis asserções.

## Provei que os testes novos recusam

| Cenário                                                   | Saída | Esperado |
| --------------------------------------------------------- | ----: | -------: |
| tudo íntegro                                              |     0 |        0 |
| `.slice(0, maxStagedRawCharacters)` removido do adaptador |     1 |        1 |
| teto de transação acima do `statement_timeout`            |     1 |        1 |
| `maxCursorLength` elevado para 100.000                    |     1 |        1 |

A última merece nota: na primeira versão ela **não** reprovava. Eu montava a entrada a partir da própria constante, então o teste acompanhava qualquer valor — verificava o mecanismo e não se o teto servia para alguma coisa. É a armadilha do teste que não pode falhar. Acrescentei a asserção absoluta: um cursor de 1024 caracteres tem de ser recusado, qualquer que seja a constante.

## Deploy — verificado, e estava correto

| O quê                                   | Como conferi                                                          | Resultado                         |
| --------------------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| Migração é idempotente                  | `docker compose run --rm migrate` de novo                             | `No pending migrations to apply`  |
| Imagem não roda como root               | `id` dentro do contêiner                                              | `uid=1000(node)`                  |
| Ordem de subida                         | `depends_on` com `service_healthy` e `service_completed_successfully` | banco → migração → API            |
| Prontidão olha migração, não só conexão | `/ready` com e sem banco                                              | 200 / 503                         |
| Persistência após parada                | parada real de 13 horas, na sessão anterior                           | 28 pedidos, 20.035 itens intactos |
| Recuperação após `SIGKILL`              | `tests/integration/recovery.test.ts`                                  | 34/34                             |
| Poda da imagem não quebra o runtime     | teste de fumaça do Dockerfile, que agora importa a borda HTTP         | build falha se faltar dependência |

O que **não** existe, e é honesto dizer: nenhuma execução real do pipeline. O workflow foi escrito em OPS-01 e este repositório não tem remoto, então o job que sobe o Compose do zero e roda a aceitação nunca rodou em runner nenhum. O equivalente foi executado à mão aqui.

Fora de escopo, observado: a imagem final tem `npm` e `apt-get`, herdados da base `node:24-bookworm-slim`. Endurecer isso não é pedido pelo enunciado e não foi feito.

## Verificação final

- `npm run check`: saída 0 — 260 testes, 0 falhas.
- `npm run coverage` com banco: saída 0 — **278 testes, 0 falhas, 0 pulados**, 97,38% de linhas.
- `npm run test:integration`: 34/34.
- Enunciado 30/30, rotas 17/17, fidelidade 156/156, política de auditoria satisfeita, `/docs` em 200.
- Imagem reconstruída e o pedido no limite de 10.000 itens carregado por ela em 2,1 s.
