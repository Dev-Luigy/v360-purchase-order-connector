# Handoff: FIX-03 — riscos residuais de REVIEW-02 e REVIEW-03

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: cruzar os três reviews existentes com o código de hoje e fechar o que é defeito inequívoco. Cinco corrigidos, todos verificados antes e depois. O que exige decisão ficou listado sem tocar, no fim.

## Corrigidos

1. **Amplificação por expoente** (REVIEW-03, 1). `Decimal.parse` passa a conferir grandeza e profundidade **antes** de qualquer texto existir. Era pior do que o relatado: `1e1000000` produzia uma string de ~1 milhão de caracteres em 38ms e **não** era rejeitada por nada — o `decimalTextSchema` só veria o resultado já materializado. Os limites (24 dígitos inteiros, 12 decimais) agora são constantes do domínio, e o regex do schema é construído a partir delas, para os dois não divergirem.
2. **Identidade de fornecedor comparada com leniência no domínio** (REVIEW-03, 3). `checkInvoice` removia todo caractere não numérico e, chamado direto, **aprovava** `abc12.345.678/0001-90xyz`. A validação da borda era contornável. Agora o domínio compara `TaxId` estritamente; tirar máscara é trabalho da fronteira — adaptador para arquivo, schema para HTTP.
3. **Máscara híbrida de CNPJ** (REVIEW-03, 4). `12.345678/0001-90` passava, o que não é nem CNPJ limpo nem máscara completa, e contradizia o comentário da própria função. Agora é tudo ou nada.
4. **`isoInstantSchema` só sintático** (REVIEW-03, 5). `2026-99-99T99:99:99.999Z` passava. Corrigi o irmão `isoDateSchema` em FIX-01 e deixei este para trás. Cuidado que custou uma iteração: `toISOString()` lança quando a data é inválida, então o `NaN` precisa ser filtrado antes, senão o refine estoura em vez de recusar.
5. **O glob de teste ignorava subpastas** (REVIEW-02, 7). `tests/*.test.ts` não varre `tests/sub/`. Provei criando `tests/sub/nunca-roda.test.ts` com `assert.fail` garantido: `npm test` respondeu **86 testes, 0 falhas**. O script passa a `node --import tsx --test "tests/**/*.test.ts"` — as aspas importam, quem expande é o Node, não o shell. Um teste guarda o próprio script contra alguém "simplificar" de volta.

## Validação

`npm run check` verde: **92 testes**, cobertura **98,26% de linhas e 87,08% de branches**. Os três reviews foram verificados achado a achado, executando o código; nada foi aceito por leitura. Três testes de P1-03 e FIX-01 mudaram de expectativa porque o comportamento correto mudou, e o motivo está escrito em cada um.

Não validado: nada tocou banco, HTTP ou Docker.

## Aberto, por exigir decisão — não é defeito, é escolha

- **Notação por campo** (REVIEW-03, 6). `ClientProfile.numberFormat` é única por cliente e o Gama tem quantidade em inteiro e preço em centavos na mesma linha. Bloqueia a Parte 2, muda contrato, precisa de ADR.
- **Teto de memória do Beta** (REVIEW-03, 2). `indexHeaders` é O(total de cabeçalhos). Trade-off registrado em FIX-01; sustentar "qualquer volume" pede teto de carga, staging em banco ou exigência de ordenação.
- **`query_timeout: 3000`** (REVIEW-02, 10). Correto para `/ready`, estrangula ingestão em lote. Separar o caminho de carga do de requisição é decisão de P1-02/P1-04.
- **ESLint sem regras type-aware** (REVIEW-02, 12). `recommendedTypeChecked` num projeto que proíbe ponto flutuante para dinheiro pagaria o custo, mas é configuração compartilhada e provavelmente acusa erros novos: precisa de alinhamento com o Codex.

## Ainda de P1-02 e ENV-03, inalterados desde REVIEW-02

Runner de migração no Compose (1), `/ready` respondendo 200 com banco sem schema (2), índice que sustente o filtro de saldo (3), duas pastas de migração — `database/migrations/` existe e `prisma/` não (8), e o spike do Prisma 7 (9).

## Pendências e próxima ação

- P1-02 continua sendo o caminho crítico. `package.json` volta a ficar livre.
- Fora do escopo, não é meu: `scripts/activate-node.sh` segue apagado e o `README.md:41` ainda o referencia.
- Posse: reservas de FIX-03 liberadas.
- Revisão: não realizada.
