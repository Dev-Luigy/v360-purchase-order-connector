# REVIEW-09 — verificação do projeto após P2-01

- Agente e data: Codex, 2026-09-28.
- Escopo: revisão de código e contratos, sondas adversariais, testes locais e contra PostgreSQL, Docker, dependências e documentação.
- Resultado: a base compila e as suítes existentes passam, mas P2-01 abriu cinco falhas reproduzidas de integridade, validação ou limite e duas lacunas de composição ou concorrência. Não alterei código de produção.

## Achados

### R09-01 — alta — reconciliação apaga o staging antes de o pedido ser salvo

`PrismaStagingRepository.takeFor` lê e apaga dentro de uma transação própria (`staging-repository.ts:51-81`). Depois que ela confirma, o caso de uso chama `replaceSnapshot` em outra transação (`ingest-purchase-orders.ts:62-76`). A afirmação no código e no ADR de que uma falha ao gravar o pedido restaura o staging não é verdadeira: não existe transação do chamador envolvendo os dois repositórios.

Sonda com o mesmo caso de uso, staging em memória e falha induzida em `replaceSnapshot`:

```text
stagedBefore: 2
rejectedOnSave: 3
stagedAfterFailure: 0
```

Critério de correção: consumir staging e substituir o pedido na mesma transação PostgreSQL, ou adotar reserva/ack que nunca perca o item. Um teste deve provocar falha depois da leitura e provar que os itens continuam esperando.

### R09-02 — alta — Gama não valida o cabeçalho repetido de cada linha

`FlatJsonAdapter` usa `group.header ??= readOrderHeader(...)` (`flat-json-adapter.ts:98-108`). Só a primeira linha passa pela validação de fornecedor, situação e data; nas seguintes, apenas o item é lido. Uma segunda linha do mesmo pedido com `situacao: 9` e CNPJ inválido foi aceita sem rejeição, e os dois pedidos da fixture continuaram emitidos.

Isso é uma falha de borda: campos externos inválidos atravessam justamente porque o tipo do primeiro registro já foi preenchido. Cada linha precisa ter o cabeçalho validado e comparado ao primeiro; divergência deve recusar o retrato inteiro, não escolher silenciosamente um dos valores.

### R09-03 — alta — pedido Gama fora de ordem vira retratos parciais

O adaptador fecha o grupo quando o número muda, mas não mantém o conjunto de grupos encerrados (`flat-json-adapter.ts:65-103`). Reordenando a fixture como `GL-778`, `GL-779`, `GL-778`, a sonda devolveu:

```text
GL-778 [linha 1]
GL-779 [linha 1]
GL-778 [linha 2]
rejeições: 0
```

O caso de uso grava os dois snapshots de `GL-778` em sequência; o segundo substitui o primeiro e apaga a linha 1. O enunciado não garante ordenação. Aplicar a mesma detecção de grupo reaberto já usada no Beta, ou usar estratégia de agrupamento explicitamente limitada.

### R09-04 — alta — item órfão pula o schema Zod antes de ser persistido

No Delta, `readItem` é colocado diretamente em `StagedItem` (`split-json-adapter.ts:104-122`). `normalizedItemSchema` só é aplicado muito depois, ao retirar do repositório Prisma; o repositório em memória usado nos testes nunca o aplica. Uma sonda com material de 129 caracteres — acima do contrato e da futura coluna do item — produziu `orphanStaged: 129` e zero rejeições.

Além de armazenar dado fora do contrato, valores incompatíveis com JSONB/PostgreSQL podem transformar aceitação parcial em 500, pois `staging.stage` fica fora do tratamento por registro. Validar o item normalizado antes de entrar no batch/staging e alinhar o test double à implementação real.

### R09-05 — média — `split-json` não respeita lote nem memória limitada para órfãos

Todos os cabeçalhos ficam em `pendentes` e todos os órfãos em `staged` até o fim do arquivo (`split-json-adapter.ts:68-137`). O `batchSize` só corta pedidos e rejeições. Com `new SplitJsonAdapter(2)` e os quatro itens da fixture sem cabeçalhos, saiu um único lote com `staged: 4`.

Isso contradiz a ADR-008 (“nada exige a carga inteira em memória”). Não há teto de cabeçalhos equivalente ao Beta, e `raw` também não tem limite próprio no schema da resposta. Emitir staging em lotes, limitar o índice de cabeçalhos e definir teto/retorno do conteúdo cru.

### R09-06 — média — atualização avulsa do Delta pode perder concorrência

Para item de pedido existente, o caso de uso lê o pedido em `findByExternalNumber`, monta um snapshot completo e só então chama `replaceSnapshot` (`ingest-purchase-orders.ts:84-98`). O advisory lock existe dentro de `replaceSnapshot`, portanto é adquirido depois da leitura. Duas cargas simultâneas com linhas diferentes podem ler o mesmo retrato; a segunda gravação substitui a primeira e perde uma das atualizações.

O merge do item precisa ocorrer depois de adquirir o lock, dentro da mesma transação do repositório. Acrescentar teste de integração com duas cargas apenas de itens para linhas diferentes do mesmo pedido.

### R09-07 — média — o pool de ingestão existe, mas não é usado pela aplicação

`pool.ts` define presets distintos, porém `main/server.ts:25-32` cria apenas `connectDatabase(..., 'request')` e entrega os mesmos repositórios à ingestão. O comentário afirma o contrário. Assim, o preset `ingestion` de 300 segundos e quatro conexões não participa do runtime; cargas usam `query_timeout` de 3 segundos e o mesmo pool das consultas.

Compor repositórios de ingestão sobre a conexão de ingestão e fechar os dois pools, ou revogar/documentar a decisão de dois pools. Adicionar teste da composição, não apenas dos presets isolados.

### R09-08 — média — migração e repositório de staging não têm teste de integração

Os 16 testes reais cobrem pedido e conferência, mas não `PrismaStagingRepository` nem a migração `0002`. Toda a reconciliação atual é testada com `InMemoryStagingRepository`, que não revalida JSON e não reproduz transações. Isso explica R09-01 e R09-04 verdes.

Cobrir no PostgreSQL: upsert da mesma linha, isolamento por cliente/pedido, ordenação, revalidação, rollback em falha de gravação e reconciliação concorrente.

### R09-09 — baixa — documentação de estado divergiu

- README: 27 exigências no início, mas 18/18 na tabela; 208 testes em dois pontos e 192 em outro; cobertura escrita como 94,68%, enquanto a medição atual deu 95,03%.
- STATUS: ainda destaca P1-04/169 testes e P1-05/18 exigências; ao final diz que Prisma Migrate não foi confirmado e que limites faltam antes da borda HTTP, ambos já concluídos. Também afirma que o README referencia `activate-node.sh`, mas essa referência não existe mais.
- `src/infrastructure/integrations/README.md` ainda descreve Gama e Delta como trabalho futuro.

Atualizar números a partir de uma fonte única ou evitar números voláteis em mais de um documento.

## Segurança e operação

`npm audit`, inclusive com `--omit=dev`, reportou quatro vulnerabilidades altas em `deepmerge-ts` e `mysql2`, trazidas pela árvore do CLI Prisma. O Dockerfile remove esses pacotes da imagem final, portanto não há evidência de exposição no runtime podado; ainda faltam a política de exceção e o CI que provem essa poda a cada atualização. Não executar `npm audit fix --force`: a sugestão rebaixa Prisma para 6.19.3.

O working tree já continha as limpezas de comentário não commitadas em `Dockerfile`, `compose.yaml` e `prisma/schema.prisma`, além da remoção de `scripts/activate-node.sh`. Foram preservadas.

## Verificações executadas

- `npm run check`: passou; 24 arquivos de teste, sem falhas, build concluído.
- `npm run coverage`: passou; 95,03% linhas, 89,35% branches, 90,99% funções.
- `npm run test:integration`: 16/16 contra PostgreSQL 17 saudável.
- `docker compose config --quiet`: passou.
- `docker build --check .`: passou sem avisos.
- `git diff --check`: passou.
- `scripts/validate-case.mjs`: não executado nesta revisão porque somente o banco estava ativo; não subi/reconstruí a API durante uma tarefa de revisão. A evidência anterior de P2-01 registra 27/27.

## Ordem recomendada

1. Fechar R09-01 e R09-06 com uma fronteira transacional única.
2. Fechar R09-02 e R09-03 no adaptador Gama.
3. Fechar R09-04 e R09-05, incluindo limites do staging.
4. Criar os testes PostgreSQL de R09-08.
5. Corrigir a composição do pool (R09-07) e alinhar a documentação (R09-09).
6. Só então repetir `npm run check`, integração, sondas, volume Delta e as 27 exigências no ar.
