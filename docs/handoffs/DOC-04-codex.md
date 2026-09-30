# DOC-04 — guia de leitura e diagramas

- Responsável: Codex; 2026-09-30.
- Estado: concluída.
- Objetivo: ajudar o responsável a compreender o projeto e organizar a
  documentação de engenharia com pouca sobreposição.

## Entregas

- `docs/ENGINEERING.md`: índice curto e regra de responsabilidade documental.
- `docs/PROJECT-GUIDE.md`: modelo mental das camadas, fluxos de ingestão,
  conferência, consulta e relatórios, conceitos difíceis e roteiro de leitura.
- `docs/diagrams/classes.md`: principais tipos de domínio, casos de uso,
  contratos/portas e implementações.
- `docs/diagrams/processes.md`: startup e recuperação, ingestão,
  reconciliação de itens sem cabeçalho, conferência e consulta.
- `docs/diagrams/README.md`, `docs/API.md` e README raiz: navegação e indicação
  das fontes; o contrato deixou de afirmar que integração PostgreSQL nunca foi
  executada. README também aponta a política de auditoria adicionada em OPS-01.

Os diagramas Mermaid ficam em blocos Markdown para renderização embutida no
GitHub. A skill Figma disponível não oferece geração de class diagram. Os
diagramas de contrato PlantUML existentes foram preservados e continuam com
seu escopo específico.

## Fontes conferidas

`src/domain/{purchase-order,conference,ingestion}.ts`, portas em
`src/application/ports/`, casos de uso em `src/application/use-cases/`, rotas
HTTP, perfis e adapters em `src/infrastructure/integrations/`, repositórios em
`src/infrastructure/database/`, composição em `src/main/server.ts`, e o teste
`tests/integration/recovery.test.ts`.

Atualizei também pontos documentais que ficaram desatualizados depois de
OPS-01: a política e workflow existem, mas não se afirma que o GitHub Actions
rodou; e os testes de integração PostgreSQL já foram executados em ambiente
descartável.

Atualizei também pontos documentais que ficaram desatualizados depois de
OPS-01: a política e workflow existem, mas não se afirma que o GitHub Actions
rodou; e os testes de integração PostgreSQL já foram executados em ambiente
descartável.

## Validação

- `npm run check`: aprovado (27 testes sem falha, lint, typecheck, formatação e
  build).
- `git diff --check`: aprovado.
- Não houve mudança no código de produção.
