# Handoff: P1-01 — contrato normalizado e decisões de negócio

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: fechar as decisões que o enunciado deixa em aberto e escrever o contrato único em tipos, para que P1-02 e P1-03 possam andar em paralelo. Implementado: cinco ADR, o contrato HTTP e o contrato em código. **Não** implementado, de propósito: schema, migrações, adaptadores, casos de uso e rotas.
- Arquivos alterados: `docs/decisions/ADR-006-modelo-normalizado.md`, `ADR-007-decimal-e-unidade.md`, `ADR-008-ingestao.md`, `ADR-009-conferencia.md`, `ADR-010-paginacao.md`, `docs/decisions/README.md`, `docs/API.md`, `src/domain/{primitives,client,purchase-order,conference,ingestion}.ts`, `src/application/ports/{pagination,purchase-order-repository,conference-repository,source-adapter,client-profiles}.ts`, `docs/COLLABORATION.md` (uma linha do mapa), `README.md` (um link), `docs/TASKS.md`, este handoff.

## Decisões, em uma linha cada

- **ADR-006:** identidade `(clientId, externalNumber)`; situação canônica de três valores com vocabulário no perfil do cliente e rejeição de valor desconhecido; data como data; saldo persistido por item e sinalizado no pedido para sustentar índice.
- **ADR-007:** decimal como texto do começo ao fim; preço sempre na unidade de compra com fator por item; unidade canônica de conferência é a unidade de consumo; arredondamento meio para cima na escala da moeda, só no final, tolerância zero.
- **ADR-008:** cliente explícito no caminho, nunca deduzido; um adaptador por forma de entrega mais perfil por cliente; perfil em código com critério de graduação para o banco; reenvio como retrato por pedido em transação; `items: null` preserva itens; staging para o Delta sem par; aceitação parcial com relatório.
- **ADR-009:** sete regras de conferência na ordem, taxonomia fechada de sete códigos, todas as divergências devolvidas, conferir não consome saldo, retrato do que foi comparado gravado junto.
- **ADR-010:** cursor opaco sobre a identidade interna com impressão dos filtros; padrão 50, teto 100 com erro acima; limitação de varredura sob escrita concorrente assumida e documentada.

## Três pontos em que discordei do que já estava escrito

1. **Rebaixei o item 4 do [TECHNICAL_PLAN](../TECHNICAL_PLAN.md).** Ele se comprometia a resolver instantâneo persistido ou versionamento consultável antes de fechar a Parte 1. O enunciado não pede isso; pede paginação com filtros e escolha defendida. ADR-010 documenta a limitação em vez de construir a solução.
2. **Substituí a proposta de "não disponibilizar pedido incompleto"** do mesmo plano. Cabeçalho do Delta sem itens é pedido legítimo com saldo zero, e uma conferência contra ele já devolve `MATERIAL_NAO_ENCONTRADO` pelas regras normais — não precisa de sinalização especial. O que precisava de tratamento era o oposto, e não estava previsto: carga só de cabeçalho **apagaria** os itens já conhecidos. Daí `items: null` no contrato.
3. **Dimensionei o perfil de cliente menor** do que a sugestão que veio de um agente em background: configuração tipada em código, validada no start, com critério explícito de graduação para tabela. Quatro clientes não pagam tabela, endpoint de administração e versionamento de perfil, e o enunciado cobra decisão defensável, não painel.

## Validação

- `npm run check` verde: tipagem estrita, lint, formatação, testes e build.
- O contrato compila sob `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` e `verbatimModuleSyntax`.
- Verifiquei com `node` que os timestamps do Gama (`1786752000`, `1784160000`) são múltiplos exatos de 86400, portanto meia-noite UTC, e que interpretá-los em `America/Sao_Paulo` deslocaria a data um dia. Também confirmei a dízima do `TRP-09` (10000 centavos ÷ fator 3 = 3333,333… centavos por unidade). São as duas evidências que sustentam ADR-006 e ADR-007.
- **Nenhum teste novo:** este entregável é tipo e decisão, não comportamento. As regras de ADR-009 precisam de teste em P1-03, com as fixtures de `tests/fixtures/`, que ainda não são lidas por nenhum teste.

## Pendências e próxima ação

- Mecanismo de serialização de cargas do mesmo pedido: advisory lock por hash de `(clientId, externalNumber)` ou trava na linha. Fica para P1-02.
- Política contra regressão por carga atrasada: não decidida; hoje prevalece a última carga aceita.
- Disparo da reconciliação do staging do Delta: não definido.
- Escala definitiva das colunas `NUMERIC`: P1-02.
- Biblioteca decimal do domínio: P1-03. `Prisma.Decimal` fica confinado à infraestrutura.
- Termo do Beta para "encerrado" segue suposição (`ENCERRADO`).
- P1-02 e P1-03 estão liberadas e são paralelizáveis: P1-02 toca `prisma/`, `src/infrastructure/database/` e migrações; P1-03 toca `src/domain/` (implementações), `src/infrastructure/integrations/` e `tests/`. Combinar antes de tocar `package.json`.
- Posse: reservas de P1-01 liberadas.
- Revisão: não realizada por outro agente. As decisões de negócio merecem revisão do Codex antes de P1-04.
