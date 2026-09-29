# Handoff: FIX-12 — o que REVIEW-11 mostrou em aberto

- Agente e data: Claude, 2026-09-29.
- Estado: concluída.
- Objetivo e resultado: os três achados de [REVIEW-11](REVIEW-11-pos-fix-11-codex.md) estão fechados. Reproduzi os dois de comportamento com sonda antes de aceitar; o terceiro é verificável lendo o código que eu mesmo escrevi.

## R10-01 — a minha correção de R10-03 criou esta lacuna

Em FIX-11 eu fiz duas coisas que se atrapalham: escoei o staging em lotes (R10-03) e agrupei os itens avulsos por pedido **dentro de cada lote** (R10-01). Como as linhas de um pedido atravessam lotes, cada lote abria uma transação nova para o mesmo pedido.

```
sonda: cinco itens, batchSize=2  ->  versao 1 -> 4  (tres transacoes)
```

Meus testes não pegaram porque usavam duas linhas, abaixo do lote padrão de 200, ou chamavam o repositório com o grupo já montado. O caminho adaptador → caso de uso → repositório com o mesmo pedido cruzando lotes não existia em teste nenhum. O review apontou isso explicitamente, e estava certo.

**A correção separa guardar de decidir.** `stageLooseItems` grava e não decide nada; `consolidateStaged` roda **uma vez por pedido, depois de ler tudo**, e aplica todas as linhas que esperavam num retrato só. A tabela de espera passa a ser o acumulador, então a leitura continua em fluxo e nada além dos números de pedido fica em memória — com teto próprio, `maxStagedOrders`.

Aumentar o lote, como o review avisa, só adiaria o defeito.

## R10-03 — dois `continue` pulavam a conferência de lote

Cabeçalho conflitante e pedido acima do teto de itens saíam por `continue` antes da verificação. Cinco conflitos com lote 2 produziam um lote de cinco.

O teste que eu tinha escrito verificava `porLote.length > 1` — um **sintoma**, não o invariante. O novo afirma o invariante: nenhum lote passa do teto, em três caminhos diferentes (itens inválidos, cabeçalhos conflitantes e vários pedidos acima do teto). Era o que faltava para o teste valer alguma coisa.

## R10-06 — o gerador de evidência não era fail-closed

Este é o mais constrangedor. Escrevi `evidence.mjs` justamente para os números pararem de derivar, e ele:

- capturava a falha do `npm` e devolvia a saída como se fosse sucesso;
- lia `fail` e não fazia nada com o número;
- rodava `npm run coverage` e publicava sob o rótulo `npm run check`, que não havia executado;
- sem `--full`, apagava a evidência de integração anterior em silêncio.

Um gerador que publica número de execução que falhou é **pior que digitar à mão**: publica com a autoridade de ter medido.

Agora ele roda `npm run check` de verdade — porque é ele que o rótulo promete — e a cobertura à parte, recusa qualquer suíte com falha, e sem `--full` preserva a frase da integração **marcada como não medida**, em vez de apagá-la ou reaproveitá-la calada.

E ganhou teste, que é o que faltava para não ser mais um lugar onde eu prometo e ninguém confere. Verifiquei também na prática, induzindo uma falha: saída 1 e `docs/STATUS.md` intacto.

## Evidência

```
npm run check              235 testes, 0 falhas (219 sem banco, 16 pulados)
npm run test:integration    27 testes contra PostgreSQL real
npm run coverage            93,76% linhas, 90,02% branches
scripts/validate-case.mjs   27/27, duas execuções seguidas
```

A cobertura caiu de 94,66% para 93,76% porque `evidence.mjs` entrou na medição e só a parte pura dele tem teste — o caminho que executa `npm` não é exercitado pela suíte.

Sondas depois da correção:

```
R10-01  versao delta=1, itens=5, itemsAccepted=5, staged=0
R10-03  cinco conflitos com batchSize=2 -> lotes [2,2]
```

## Pendências

- Espera sem expiração nem teto por cliente ([ADR-008](../decisions/ADR-008-ingestao.md)); `maxStagedOrders` limita a carga, não o acúmulo no banco.
- Medição de volume do caminho Delta de itens avulsos: tem regressão funcional, não medição.
- O validador ainda não cria banco isolado; ele afirma sobre o que cria, o que bastou para os cenários reproduzidos, mas um banco arbitrariamente povoado continua território não testado.
- CI e política de exceção da auditoria npm, adiados pelo usuário.
- Credenciais DDL e DML compartilhadas fora do ambiente local.
- Posse: reservas de FIX-12 liberadas.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam CLEAN-01 do Codex; `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
