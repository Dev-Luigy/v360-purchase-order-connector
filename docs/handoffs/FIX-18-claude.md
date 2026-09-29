# Handoff: FIX-18 — espera invisível depois de um fechamento que falha

- Agente e data: Claude, 2026-09-29.
- Estado: concluída.
- Objetivo: fechar R17-01 de [REVIEW-17](REVIEW-17-validacao-pos-fix-17-codex.md) e refazer a validação inteira, a pedido do usuário.

## O que o Codex verificou

REVIEW-17 confirmou que FIX-17 fechou os dois achados anteriores — JSON Alfa truncado deixa **zero** pedidos, e a carga dona contabiliza 2.000/2.000 mesmo com cabeçalho concorrente. E encontrou um caminho que eu não cobri.

## R17-01 — o caminho de falha que FIX-17 descobriu

Ao tirar a recontagem posterior ao fechamento, eu deixei o **caminho de falha** sem tratamento. Reproduzido por HTTP:

```
antes   HTTP 200, aceitos=0, recusas=1, espera=0
        linhas não publicadas no banco: 1
```

A linha ficava invisível: ninguém a reconcilia, o relatório não a menciona, e só a varredura de uma hora a removia. Mentira dos dois lados.

**A decisão foi fixar um invariante, não remendar a contagem:** _carga terminada não deixa linha não publicada_. Relatar a linha como "esperando" seria mentir de outro jeito — ela não espera cabeçalho nenhum, porque é invisível. Ela é descartada e o pedido volta como recusa, que é o que o relatório já dizia.

```
depois  HTTP 200, aceitos=0, recusas=1, espera=0
        linhas não publicadas no banco: 0
```

A primeira versão da correção produziu **duas** recusas para o mesmo evento — a do fechamento e a da rede de segurança. Ruído: o `catch` passou a descartar e a explicar uma vez, e o descarte final virou rede de segurança que normalmente encontra zero.

## Uma nota sobre o STATUS

O Codex escreveu à mão a linha de evidência do `STATUS.md`, que existe para ser **gerada** por `npm run evidence` — é a prática que fez os números derivarem três vezes e o motivo do gerador existir. A trava que eu tinha deixado pegou na hora: `tests/evidencia.test.ts` falhou porque o marcador não casava mais.

Restaurei o formato e regenerei. Não é crítica ao conteúdo dele, que estava correto; é que o número escrito à mão não tem quem o mantenha.

## A validação inteira, refeita

```
npm run check                   247 testes, 0 falhas (231 sem banco, 16 pulados)
npm run test:integration         33 testes contra PostgreSQL real
scripts/validate-case.mjs        30/30, duas execuções seguidas
npm run validate:http            17/17 pelas rotas da aplicação
npm run validate:sweep           201 páginas, 8 lotes durante, zero repetidos,
                                 escrita ainda ativa depois do fim
verify-persistence.mjs           pedidos e histórico sobrevivem ao reinício
```

Volume nos quatro formatos, 20.000 pedidos e 60.000 itens cada:

| Formato | Carga                 | Profundidade |
| ------- | --------------------- | ------------ |
| Alfa    | 85,9s — 233 pedidos/s | 0,44×        |
| Beta    | 87,3s — 229 pedidos/s | 0,64×        |
| Gama    | 85,1s — 235 pedidos/s | 0,75×        |
| Delta   | 90,4s — 221 pedidos/s | 0,72×        |

Coerência do banco depois de tudo, com 80.001 pedidos e 240.001 itens carregados:

```
espera NÃO publicada     0     <- o invariante desta tarefa
espera publicada         404   <- órfãos legítimos, aguardando cabeçalho
restos de spool          0
```

## Pendências

- Continua aberto o conjunto operacional: **CI, política de auditoria npm, autenticação, separação DDL/DML, TTL da espera e prova com mais de uma réplica**. Nenhum é exigência do enunciado; o CI é o que faria estas checagens deixarem de depender de execução manual.
- Posse: reservas de FIX-18 liberadas.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam CLEAN-01 do Codex. `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
