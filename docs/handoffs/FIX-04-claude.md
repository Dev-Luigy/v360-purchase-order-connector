# Handoff: FIX-04 — pontos que dependiam de decisão

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: fechar os quatro pontos que FIX-03 deixou em aberto por exigirem decisão, autorizados pelo usuário. Dois eram defeitos latentes de contrato e de recurso; dois eram configuração. Registro em [ADR-012](../decisions/ADR-012-notacao-por-campo.md).

## O que mudou

1. **Notação numérica por natureza do campo.** `ClientProfile.numberFormat` virou `{ quantity, money }`. O Gama era inexprimível: `qtd_ped` é `10` e `fator_conv` é `12` em inteiro simples enquanto `preco_unit_centavos` é `120000`, na mesma linha — declarar `cents` para o cliente faria quantidade e fator virarem `0,10` e `0,12`. **Mudança de contrato**, em `src/domain/client.ts`, com ADR e diagrama regerado.
2. **Teto de cabeçalhos no adaptador do Beta.** O índice que permite agrupar itens sem carregar o arquivo inteiro crescia sem limite. Agora a carga acima do teto é recusada com motivo em vez de derrubar o processo. O teto ficou **fora** do `try` por registro: dentro, viraria uma linha de relatório e a carga seguiria consumindo memória — errei isso na primeira tentativa e o teste pegou.
3. **Pool por propósito**, em `src/infrastructure/database/pool.ts`. `request` mantém `query_timeout: 3000`, que é certo para `/ready`; `ingestion` não tem tempo limite de consulta, espera mais para conectar e usa poucas conexões. Separado no preset e não no ponto de uso, para a carga não herdar o limite por descuido.
4. **ESLint com regras de tipo em `src`.** Custa 2 correções e pega um `any` real: `Array.isArray` estreita para `any[]` quando a união tem array somente-leitura, e o `any` se espalhava pelo `map` dos itens. Nos testes as regras rendem só ruído do `node:test` — 106 erros de promessa não aguardada em chamadas de `test` —, então ficam fora.

## Validação

`npm run check` verde: **95 testes**, tipagem, lint (agora com tipo em `src`), formatação e build.

O teste do perfil sintético foi reescrito para usar a **notação real do Gama** — quantidade em inteiro, preço em centavos, data em timestamp Unix, tudo na mesma linha — e passa. É a prova de que a Parte 2 não vai esbarrar nisso, obtida antes de a Parte 2 começar.

Não validado: nada tocou banco, HTTP ou Docker. O pool de ingestão existe como preset e ainda não tem consumidor; entra em P1-04.

## Pendências e próxima ação

- P1-02 é o caminho crítico e está livre: schema Prisma, migrações e repositórios.
- P1-04 cria o pool de ingestão e usa `invoiceCheckRequestSchema` na borda.
- O teto de cabeçalhos é constante do adaptador; quando a ingestão tiver endpoint, decidir se vira parâmetro da carga.
- Continuam de P1-02/ENV-03 desde REVIEW-02: runner de migração no Compose, `/ready` respondendo 200 com banco sem schema, índice que sustente o filtro de saldo, `database/migrations/` versus `prisma/`, e o spike do Prisma 7.
- Fora do escopo, não é meu: `scripts/activate-node.sh` segue apagado e o `README.md:41` ainda o referencia.
- Posse: reservas de FIX-04 liberadas.
- Revisão: não realizada.
