# Handoff: DOC-02 — README como artefato avaliado

- Agente e data: Claude, 2026-09-28.
- Estado: concluída.
- Objetivo e resultado: o enunciado diz que "o README é artefato avaliado" e cobra nele três defesas específicas. Nenhuma das três estava lá. Agora estão, e o README descreve o sistema que existe.

## O que estava errado

O README descrevia um projeto de duas semanas atrás. Afirmava que "somente `GET /health` e `GET /ready` estão implementados", que "persistência real continua sem validação", que "a Parte 1 ainda não está concluída" e que a próxima etapa era ENV-03 — tudo falso desde P1-04. Um avaliador que lesse só o README concluiria que o desafio não foi feito.

Também referenciava `scripts/activate-node.sh`, apagado no working tree por alteração preexistente. A referência pendurada era minha responsabilidade no arquivo reservado; saiu junto com a seção de ferramental local, que descrevia uma instalação específica deste workspace e não ajuda quem clona o repositório.

## As três defesas que o enunciado cobra

**Regras de conferência.** As sete em tabela, com as **quatro decisões não óbvias** defendidas em prosa: conferir não é receber (a conferência não consome saldo, senão o número divergiria da fonte na carga seguinte); devolvemos todas as divergências e não a primeira; material ambíguo é divergência e não palpite (escolher errado consome o saldo da linha errada, e o erro só aparece muito depois); linhas repetidas da nota são somadas antes de comparar com o saldo. Mais as duas fronteiras: pedido inexistente é 404, e a taxonomia é fechada de propósito.

**Política de reenvio.** Retrato completo por pedido em uma transação, com o argumento central explícito: nenhum formato informa o que mudou, então aplicar diferenças exigiria confiar que a carga anterior estava completa, e uma carga parcial corromperia o saldo em silêncio. As três consequências assumidas — serialização por advisory lock, "prevalece a última carga aceita" com `ingestedAt` para tornar a regressão detectável, e histórico que guarda a versão conferida.

**Delta sem correspondência.** Item sem cabeçalho vai para staging; cabeçalho sem itens é pedido legítimo. A assimetria é o ponto, e está defendida: o cabeçalho é a identidade do pedido, o item não é; e um pedido inventado a partir do item não teria situação, então a regra 2 nunca poderia conferi-lo. Marcado como decidido e **não implementado** — é Parte 2, e dizer o contrário seria mentir no artefato avaliado.

Acrescentei a defesa da **paginação por cursor**, que o enunciado também manda defender ("a estratégia é nossa e defendemos a escolha"), ancorada no caso de uso que ele mesmo descreve: varredura de madrugada enquanto novas cargas entram. Com `OFFSET`, uma inserção no meio desloca a janela e a varredura pula ou repete pedidos — e repetir é o pior dos dois, porque faria reconferir nota já conferida.

## Números conferidos, não herdados

O README anterior repetia números de outras tarefas. Remedi o que afirmei: a cobertura é **94,68%**, não os 94,69% que `docs/STATUS.md` carregava desde REVIEW-07 — corrigi nos dois. Os 192 testes, as 18 exigências e as medições de volume vêm de execução desta sessão. Todos os links relativos do README foram verificados: nenhum quebrado.

## Limitações registradas no próprio README

Ficaram visíveis para o avaliador, em vez de escondidas no `STATUS`: carga síncrona de 3,2 minutos que um balanceador derruba sem retomada; teto de requisições por origem e não por identidade; Windows-1252 com CRLF sem fixture ponta a ponta; credencial única para DDL e DML; ausência de CI. E o que não foi implementado por não ser pedido — autenticação, autorização, SLA, métricas, fila — dito explicitamente, para não parecer esquecimento.

## Pendências e próxima ação

- **A tag `parte-1` está destravada** e é a ação imediata: era DOC-02 que a bloqueava.
- Depois dela, P2-01: Gama e Delta.
- Posse: reservas de DOC-02 liberadas.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam alterações de CLEAN-01 do Codex; `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
