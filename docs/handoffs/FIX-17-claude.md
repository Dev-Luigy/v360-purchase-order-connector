# Handoff: FIX-17 — atomicidade do documento e relatório da própria carga

- Agente e data: Claude, 2026-09-29.
- Estado: concluída.
- Objetivo: fechar R16-01 e R16-02 de [REVIEW-16](REVIEW-16-validacao-integral-pos-fix-16-codex.md).

## R16-01 — 422 sem recibo, com 200 pedidos gravados

Reproduzido pela rota, com JSON Alfa truncado depois de exatamente um lote:

```
HTTP 422 payload_incompativel
pedidos gravados pela carga que respondeu 422: 200
```

A compensação que eu escrevi em FIX-16 limpava a **espera** e não os retratos. E o cenário oficial usava Delta item-only, onde nenhum pedido seria criado de qualquer forma: ele provava a limpeza da espera, não a atomicidade do documento. O review viu isso e está certo.

**A decisão foi tomada medindo, não por gosto.** Havia dois contratos coerentes: recusar tudo, ou aceitar o prefixo devolvendo um relatório que o contabilize. O que decidia era o custo de conferir o documento antes de gravar:

```
20.000 pedidos / 60.000 itens: passagem estrutural em 0,6s
a carga completa leva ~83s  ->  a passagem custa 1%
```

A 1%, não há motivo para deixar meia carga aplicada sem recibo. `checkStructure` percorre o payload **já em disco** sem materializar valor nenhum, antes de qualquer escrita. O streaming e o limite de memória continuam intactos: é uma segunda leitura do spool, não uma transação sobre a carga inteira.

Isso **não** contradiz a aceitação parcial do ADR-008, e a atualização que escrevi ali diz por quê: ela vale para **registro inválido**, que continua recusado individualmente e sempre volta no relatório. Documento truncado é falha de transporte.

Para o CSV a conferência é outra: um CSV truncado não é malformado — a última linha incompleta é um registro ruim, que a aceitação parcial já trata. O que falha em fluxo ali é o encoding declarado não bater com o conteúdo, e é isso que a passagem verifica.

## R16-02 — o relatório era recalculado depois dos locks

`finalizeStaged` já devolvia `{ waiting }` sob o lock, e o caso de uso **ignorava**: recontava com `countStaged`/`sampleStaged` depois de soltar tudo. Entre uma coisa e outra, um cabeçalho concorrente consumia uma linha e ela sumia do relatório da carga que a recebeu. FIX-16 reduziu a janela; não a fechou.

Agora contagem **e amostra** saem do mesmo fechamento que publica as linhas. `countStaged` e `sampleStaged` saíram do caminho do relatório.

```
antes   carga dona: espera=1999, contabilizado 1999/2000
depois  carga dona: espera=1999, contabilizado 2000/2000
```

## Evidência

```
npm run check              247 testes, 0 falhas
npm run test:integration    31 testes contra PostgreSQL real
npm run validate:http       16/16 pelas rotas da aplicação
```

Dois cenários novos no aceite: `documento truncado não grava pedido nenhum` e `o relatório da carga conta o que ela mesma recebeu`. As sondas originais do review foram rodadas sem alteração e mudaram de comportamento.

## Uma nota sobre o teste que quase escrevi mal

Ao cobrir R16-01 eu comecei escrevendo só a metade que recusa. Um teste assim passa com uma verificação que recusa **tudo** — inclusive documento válido. Acrescentei o caminho feliz junto, e os dois vivem lado a lado de propósito.

## Pendências

- Continua aberto o mesmo conjunto operacional: **CI, política de auditoria npm, autenticação, separação DDL/DML, TTL da espera e prova com mais de uma réplica**.
- Posse: reservas de FIX-17 liberadas.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam CLEAN-01 do Codex. `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
