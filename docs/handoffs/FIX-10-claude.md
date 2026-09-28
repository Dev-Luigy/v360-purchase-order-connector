# Handoff: FIX-10 — os nove achados de REVIEW-09

- Agente e data: Claude, 2026-09-28.
- Estado: concluída.
- Objetivo e resultado: os nove achados de [REVIEW-09](REVIEW-09-pos-p2-01-codex.md) estão fechados, cada um com regressão. **Nenhum era falso positivo** — diferente de REVIEW-05, onde dois estavam desatualizados. Três deles eram comentários meus afirmando o que o código não fazia.

## O que eu verifiquei antes de aceitar

Reproduzi os cinco achados reproduzíveis com uma sonda antes de tocar em código:

```
R09-01  em espera antes: 2 | pedidos recusados: 3 | em espera DEPOIS: 0  <-- PERDIDO
R09-02  pedidos aceitos: 2 | recusas: 0  <-- situacao 9 e CNPJ invalido passaram
R09-03  retratos: GL-778[1] GL-779[1] GL-778[1] | recusas: 0  <-- o 2o apaga o 1o
R09-04  em espera: 1 | recusas: 0 | material com 129 caracteres  <-- fora do contrato
R09-05  com batchSize=2, staged por lote: 4  <-- um lote so
```

R09-06 e R09-07 foram confirmados por leitura, e R09-09 conferindo os números.

## R09-01 e R09-06 — a fronteira transacional

Eu havia escrito, no código e no ADR, que "ler e apagar acontecem na mesma transação, então uma falha ao gravar o pedido deixa o item esperando". **Era falso.** `takeFor` abria transação própria e `replaceSnapshot` outra; entre as duas não havia nada. E o item avulso era lido com `findByExternalNumber` **fora** do advisory lock, que só existe dentro de `replaceSnapshot` — duas cargas simultâneas liam o mesmo retrato e a segunda apagava a linha da primeira.

A correção não foi costurar as duas transações: foi mover a espera para **dentro do repositório de pedidos**. É o mesmo agregado e precisa do mesmo lock, então a porta `StagingRepository` deixou de existir. `replaceSnapshot` absorve a espera logo depois de pegar o lock; `applyLooseItem` decide sob o lock se aplica ou guarda. A política de mesclagem — "a carga da vez manda" — virou função pura em `domain/ingestion.ts`, usada pelas duas implementações, para que o dobro em memória não possa divergir da real.

## R09-02 e R09-03 — o adaptador do Gama

`group.header ??= readOrderHeader(...)` validava só a primeira linha do grupo. Eu tinha escrito um comentário justificando isso, mas o comentário respondia a outra pergunta: falava sobre **divergência entre linhas**, e o efeito real era que campos inválidos nas linhas seguintes não eram olhados. O resultado dependia da ordem das linhas — a mesma classe de defeito da prontidão que eu já tinha corrigido antes.

Agora cada linha tem o cabeçalho lido e validado. Se duas linhas válidas discordam, o pedido inteiro é recusado uma vez, porque escolher qual vale seria adivinhar.

E o Gama não detectava grupo reaberto. O Beta já detectava — a correção foi aplicar o mesmo cuidado que já existia a dez metros de distância, o que eu deveria ter feito ao escrever o adaptador.

## R09-04 e R09-05 — limites do Delta

O item órfão era normalizado e ia direto para a espera **sem passar pelo contrato**: material de 129 caracteres entrava sem recusa, e só estouraria muito depois, fora do tratamento por registro — transformando aceitação parcial em 500. Agora é validado antes de esperar.

A espera acumulava até o fim do arquivo, o que contradiz o "nada exige a carga inteira em memória" do ADR-008: passou a sair em lotes. O índice de cabeçalhos ganhou teto, como o do Beta, e estourá-lo encerra a carga em vez de virar recusa de registro — o primeiro teste que escrevi falhou justamente porque eu pus a verificação dentro do `try`. O conteúdo cru ganhou teto próprio.

## R09-07 — o pool que ninguém usava

O preset de ingestão existia desde P1-02, com 300 segundos de tempo limite, e **nada o instanciava**. A composição criava só o pool de requisição, e um comentário meu afirmava o contrário: as cargas rodavam com `query_timeout` de 3 segundos.

Havia teste dos presets isolados, e ele passava. O defeito estava na **ligação** entre o preset e a composição — exatamente a classe que me morde desde FIX-05. O teste novo lê `main/server.ts` e exige que cada propósito declarado tenha conexão criada, que a ingestão receba o repositório do pool de carga, e que todo pool criado seja fechado no encerramento.

## R09-08 — a ausência que explicava dois verdes

Toda a reconciliação era testada com o dobro em memória, que não revalidava JSON nem reproduzia transação. **Era por isso que R09-01 e R09-04 passavam verdes.** O dobro passou a revalidar, para parar de mentir, e entraram oito testes de integração contra PostgreSQL real: espera e recuperação, rollback em falha de gravação, item de pedido existente, substituição de linha reenviada, isolamento por cliente, ordem das linhas, recusa de linha gravada fora do contrato e **duas aplicações concorrentes no mesmo pedido**.

## R09-09 — números que divergiram

O README repetia contagens que o STATUS também tinha, e elas divergiram. A correção não foi acertar os números: foi **parar de duplicá-los**. Contagens e cobertura ficam só no STATUS; o README aponta para lá. O `27/27` continua no README porque está atado à lista fixa de exigências do enunciado, não ao código.

## Evidência

```
npm run check              218 testes, 0 falhas
npm run test:integration    24 testes contra PostgreSQL real, 0 falhas
npm run coverage            94,63% linhas, 89,65% branches
scripts/validate-case.mjs   27/27 exigências, na imagem reconstruída
```

Staging verificado ponta a ponta na imagem nova: carga só de itens deixa 4 esperando no banco; a de cabeçalhos aceita 3 pedidos e recupera os 3 itens; `DL-2026-0099` continua esperando.

## Auditoria das revisões anteriores

O usuário pediu, junto com REVIEW-09, uma conferência do que ficou aberto antes. Três achados de REVIEW-07 estavam marcados como "critério obrigatório de P1-04" e **não tinham sido fechados** quando P1-04 terminou. Fechei os três aqui:

- **R07-04.** `save` gravava `record.invoice` com cast, e o schema só era aplicado na leitura: uma chave extra entrava no JSONB e sumia em silêncio depois. Na prática a borda HTTP já filtrava — confirmei por sonda que `chaveExtra` não sobrevivia —, mas a porta do repositório é pública e não pode depender de quem a chama. Agora persiste o resultado do schema, e o cast ficou desnecessário.
- **R07-09.** A coerência entre `outcome` e a quantidade de divergências passou a ser verificada antes da transação, porque atravessa duas tabelas. O que cabe na linha virou `CHECK` na migração `0003`: versão de ingestão positiva e índices de linha não negativos.
- **R07-05.** As travas de tipo verificavam só atribuibilidade, que é meio caminho. Agora comparam com `Equal` nos dois sentidos. A comparação é contra a versão **mutável** do contrato, porque o Zod não expressa `readonly` — é a única diferença tolerada, e está registrada no código. Verifiquei injetando um campo a mais no contrato e confirmando que a compilação quebra.

Seguem abertos e **sem tarefa**, os mesmos de sempre: pipeline de CI e política de exceção da auditoria npm (R06-04, R06-07, R07-10), e separação de credenciais DDL/DML fora do ambiente local (R04-05). Os tetos de tamanho de R04-02 continuam escolhidos e não medidos, mas P1-05 exercitou 50.000 pedidos sem esbarrar neles.

## Pendências

- A espera continua sem expiração nem teto por cliente (ADR-008).
- `npm audit` segue reportando `deepmerge-ts` e `mysql2` pela árvore do CLI Prisma. O Dockerfile os remove da imagem final, mas **falta o CI que prove essa poda a cada atualização** — é o mesmo item adiado desde REVIEW-06.
- Posse: reservas de FIX-10 liberadas.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam CLEAN-01 do Codex; `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
