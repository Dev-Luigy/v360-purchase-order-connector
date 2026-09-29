# Handoff: FIX-14 — REVIEW-13, com aceitação pela aplicação real

- Agente e data: Claude, 2026-09-29.
- Estado: concluída.
- Objetivo e resultado: os quatro achados de [REVIEW-13](REVIEW-13-pos-fix-13-http-real-codex.md) estão fechados, e o fechamento é provado pelas rotas HTTP da aplicação em execução, como a revisão exigiu.

## O que eu confirmei antes de tocar em código

Sonda por `fetch` contra `http://127.0.0.1:3000`, com a aplicação no ar:

```
R13-01  A(aceitos=0, espera=2)  B(aceitos=2, espera=0)  | retrato=2 itens
R13-02  entradas=2  aceitos=1  espera=1  amostra=0  | retrato=1 item
R13-04  antes=1 | falha(aceitos=0, recusas=1, espera=0) | apos=1
R13-04  so cabecalho -> aceitos=10000 | retrato final=10000   <-- o original sumiu
```

O R13-04 é **perda de dado**, não só relatório errado: o item que estava gravado desapareceu, substituído pelas dez mil linhas que o relatório dizia não existir.

## A causa comum, e por que ela é minha

Em FIX-13 eu acrescentei `ingestionId` à tabela de espera para isolar as cargas. Acrescentei como **coluna**, não como identidade: a unicidade continuou em `(cliente, pedido, linha)` e o `upsert` casava por ela e sobrescrevia o dono. Como a revisão escreveu, "um campo que o `upsert` sobrescreve não fornece isolamento". Eu tinha resolvido a aparência do problema.

A migração `0005` põe a carga na identidade física: `(cliente, carga, pedido, linha)`. Duas cargas podem ter a mesma linha do mesmo pedido esperando, cada uma dona da sua. Linhas anteriores recebem um identificador reservado e continuam sendo o que sempre foram — órfãs de origem desconhecida, que só saem pela reconciliação do cabeçalho.

## Os quatro fechamentos

**R13-01.** Identidade física corrigida. Na reconciliação, quando duas cargas deixaram a mesma linha esperando, prevalece a mais recente — coerente com "prevalece a última carga aceita" do ADR-008, e agora explícito na ordenação da consulta.

**R13-02.** A contagem do relatório saía de `entradas − aplicados`, granularidades diferentes: uma linha reenviada dentro da mesma carga substitui a anterior, e a subtração fabricava espera inexistente. Agora sai de `countStaged`, uma consulta ao **estado**.

**R13-03.** O teto de itens por pedido mudou de lugar. Ele é do agregado, e só o caso de uso enxerga a soma entre lotes — o adaptador vê um lote por vez. Um pedido que passa do teto é recusado **e** o que ele já tinha escrito é descartado por `purgeStaged`. Antes, a mensagem dizia "pedido inteiro recusado" e os primeiros dez mil itens eram gravados assim mesmo.

O teste que eu tinha escrito para esse caso afirmava `staged === 10000` e uma recusa: **codificava o defeito**. Foi reescrito para afirmar que o retrato anterior não muda.

**R13-04.** Três causas, as três fechadas:

- a consolidação que falha deixa as linhas de volta na espera, e o relatório agora as mostra, porque sai do estado;
- `replaceSnapshot` com `items: null` passou a mesclar sobre os itens **gravados**, não sobre o retrato recebido — mesclar sobre ele fazia a espera substituir o conhecido;
- o agregado inteiro atravessa `normalizedOrderSchema` também em `replaceSnapshot`, não só na consolidação.

## A aceitação que a revisão pediu

`scripts/validate-fix-14-http.mjs` (`npm run validate:http`) não importa `buildApp`, repositório nem caso de uso, e não usa `app.inject`. Tudo passa por `fetch` contra a porta 3000; cada cenário afirma **status HTTP, corpo do relatório e estado observável pelas rotas** ao mesmo tempo. Os números de pedido levam um prefixo por execução, então ele é repetível sem depender do que havia antes.

```
✔ as quatro fixtures do enunciado entram pelas rotas
✔ conferência, histórico e resumo respondem
✔ duas cargas simultâneas com linhas distintas
✔ duas cargas simultâneas com as MESMAS linhas
✔ duplicata da mesma linha dentro de uma carga
✔ exatamente 10.000 itens sem cabeçalho são aceitos
✔ 10.001 itens recusam sem mudar o retrato anterior
✔ falha do agregado não esconde linhas nem apaga o retrato
✔ carga só de cabeçalho não apaga os itens conhecidos
✔ item sem cabeçalho fica esperando, e o relatório o mostra

10/10 cenários pela aplicação real
```

Acrescentei um cenário que a lista não pedia: **exatamente 10.000 aceitos**. Um teto precisa ser alcançável, e testar só a recusa esconderia um erro de contagem por um.

## Evidência completa

```
docker compose up -d --build     API e banco saudáveis, /ready 200
npm run check                    240 testes, 0 falhas
npm run test:integration          31 testes contra PostgreSQL real
npm run coverage                  93,37% linhas, 89,86% branches
node scripts/validate-case.mjs    27/27, duas execuções seguidas
npm run validate:http             10/10, duas execuções seguidas
```

## O padrão, nomeado

Cinco ciclos seguidos em que a minha correção produziu o achado seguinte. A razão é consistente: eu vinha corrigindo **o sintoma relatado** sem examinar o que a correção muda ao redor — e em FIX-13, corrigindo a aparência (uma coluna) em vez da identidade.

As mudanças que não seguiram esse padrão foram as que **centralizaram** em vez de vigiar: o objeto `Lote`, que torna impossível emitir acima do teto por construção; a contagem derivada do estado, que torna impossível o relatório divergir do banco; e agora a carga na chave física, que torna impossível uma ingestão tomar a linha da outra.

A outra lição é sobre os meus testes: o teste de R12-01 **codificava o defeito**, e o de lote afirmava um sintoma (`length > 1`) em vez do invariante. Teste escrito a partir do comportamento observado confirma o que existe; teste escrito a partir da regra pega o que falta.

## Pendências

- Espera sem expiração nem TTL global ([ADR-008](../decisions/ADR-008-ingestao.md)).
- Medição de volume do caminho Delta item-only; hoje o volume cobre Alfa e Beta.
- CI e política de exceção da auditoria npm, adiados pelo usuário. A imagem de migração ainda carrega o tooling do Prisma.
- Credenciais DDL e DML compartilhadas fora do ambiente local.
- Posse: reservas de FIX-14 liberadas.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam CLEAN-01 do Codex — no `schema.prisma` preparei o commit para levar só a identidade nova. `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
