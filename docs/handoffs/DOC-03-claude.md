# Handoff: DOC-03 — diagramas de objetos e relações

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: desenhar os objetos de P1-01 e suas relações, em fonte versionada e render legível. Implementado: dois diagramas PlantUML, o render `.svg` de cada um, o script de renderização e o índice. **Nada de contrato mudou:** o diagrama é leitura de `src/domain/**` e `src/application/ports/**`, não uma proposta.
- Arquivos alterados: `docs/diagrams/contrato-normalizado.puml` e `.svg` (33 objetos: perfil, entrada, pedido, conferência), `docs/diagrams/portas-e-consumo.puml` e `.svg` (as cinco portas, filtros, paginação e quem vai cumprir cada uma), `docs/diagrams/README.md`, `scripts/render-diagrams.mjs`, `eslint.config.js` (globais `Buffer` e `fetch` no bloco de `scripts/**`), `README.md` (seção curta com link), `docs/COLLABORATION.md` (uma linha do mapa), `docs/TASKS.md`, este handoff.
- Contratos e decisões: nenhum impacto. Os diagramas citam ADR-006 a ADR-010 nas notas; se divergirem do código, o código prevalece e o `.puml` é que se corrige.
- Validação: `npm run check` verde (tipagem, lint, formatação, dois testes, build). Os dois diagramas foram renderizados pelo servidor público do PlantUML e **inspecionados visualmente**; a primeira versão saiu com 5009px de largura e rótulos sobrepostos, e foi refeita em dois diagramas com menos rótulos. Não validado: não há PlantUML local, então não há render offline nem verificação de sintaxe sem rede.
- Pendências ou bloqueios: o modelo entidade-relacionamento das tabelas é de P1-02, e o diagrama de sequência da carga e da conferência só faz sentido depois de P1-03 — os dois estão listados em `docs/diagrams/README.md`.
- Observação fora do escopo: `scripts/activate-node.sh` aparece como apagado no working tree e **não foi apagado por esta tarefa**; ficou fora do commit. O `README.md:41` ainda o referencia. Quem apagou decide se restaura.
- Próxima ação: P1-02 e P1-03 seguem disponíveis. Quem assumir pode usar os diagramas como mapa de entrada e deve regerá-los no mesmo commit que mudar o contrato.
- Posse: reservas de DOC-03 liberadas.
- Revisão: não realizada.
