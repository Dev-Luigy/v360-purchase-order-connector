# Handoff: P1-03 — domínio e adaptadores Alfa/Beta

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: implementar o contrato de P1-01 para os dois clientes da Parte 1. Implementado: aritmética decimal, as sete regras de conferência, leitura em fluxo de JSON e CSV, os adaptadores `nested-json` (Alfa) e `paired-csv` (Beta), os perfis em código e os schemas do contrato. **Não** implementado, de propósito: persistência, casos de uso e rotas — são P1-02 e P1-04.

## Arquivos

- Domínio: `src/domain/decimal.ts`, `conference-rules.ts`, `schemas.ts`, e `client.ts` (mapa de campos, abaixo).
- Integrações: `src/infrastructure/integrations/{json-stream,csv-stream,field-parsers,record-mapping,client-profiles,nested-json-adapter,paired-csv-adapter}.ts`.
- Testes: `tests/{decimal,conference-rules,json-stream,csv-stream,adapters,client-profiles}.test.ts`.
- Decisão: `docs/decisions/ADR-011-bibliotecas-p1-03.md` e o índice. Diagramas regerados.
- Dependências: `decimal.js`, `stream-json`, `csv-parse` em `package.json` e no lockfile.

## Contratos e decisões

**[ADR-011](../decisions/ADR-011-bibliotecas-p1-03.md), escolhida pelo usuário:** decimal.js, stream-json, csv-parse e o alcance do Zod. Fecha a pendência que a ADR-007 tinha deixado para esta tarefa. O ponto de atenção que o usuário levantou — não perder informação, porque é dinheiro — virou quatro guardas sobre decimal.js, todas com teste; a mais importante é que soma, subtração e multiplicação **lançam** em vez de arredondar em silêncio.

**Acréscimo ao contrato:** `ClientProfile` ganhou `fields: ClientFieldMap`. A ADR-008 já dizia que caminho de campo é rótulo e mora no perfil, mas o tipo de P1-01 não expressava isso; sem ele, o nome de campo do cliente estaria no código do adaptador e o Delta exigiria adaptador novo. Impacto: nenhum consumidor existente; P1-04 e a Parte 2 usam.

**Decisão nova, no adaptador do Beta:** o arquivo de itens precisa vir agrupado por pedido. Agrupar sem isso custaria a carga inteira em memória, que é o que o volume do enunciado proíbe. Não é suposição silenciosa: pedido que reaparece depois de o grupo fechar tem as linhas **rejeitadas**, porque emiti-las substituiria o retrato e apagaria os itens já lidos. Precisa entrar no README (DOC-02).

## Validação

`npm run check` verde: tipagem estrita, lint, formatação, **66 testes**, build. Os adaptadores são exercitados contra as fixtures reais de `tests/fixtures/alfa/` e `beta/`, que até aqui nenhum teste lia, em pedaços de 24 bytes para provar que a leitura em fluxo não depende do corte.

Não validado: nada tocou banco, HTTP ou Docker. A variante Windows-1252 do Beta é construída no teste, não existe como fixture. Os perfis de Gama e Delta não existem — são Parte 2.

## Pendências e próxima ação

- P1-02 segue disponível e agora tem consumidor: converter `Prisma.Decimal` para `DecimalText` por `toString()`.
- P1-04 usa `invoiceCheckRequestSchema` na borda e decide o código HTTP de cada classe de erro.
- O termo `ENCERRADO` do Beta continua suposição declarada no perfil.
- Fora do escopo, não é meu: `scripts/activate-node.sh` segue apagado no working tree e o `README.md:41` ainda o referencia.
- Posse: reservas de P1-03 liberadas, inclusive `package.json` e o lockfile.
- Revisão: não realizada.
