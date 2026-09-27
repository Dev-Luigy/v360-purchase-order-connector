# Handoff: FIX-05 — congelar presets e perfis exportados

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: defeito encontrado ao verificar FIX-04. `poolOptionsFor` devolvia o preset compartilhado por referência: mutar o objeto recebido mudava o preset para todo o processo — confirmado na sonda, `max` virou 999. É a mesma classe do perfil mutável que REVIEW-03 apontou, reintroduzida em código novo.
- Arquivos alterados: `src/infrastructure/deep-freeze.ts` (novo), `src/infrastructure/database/pool.ts`, `src/infrastructure/integrations/client-profiles.ts`, `tests/fix-04-decisoes.test.ts`.
- Decisão pequena: o `deepFreeze` estava duplicado em dois módulos de infraestrutura e virou utilitário compartilhado. As constantes `alfaProfile` e `betaProfile` passam a nascer congeladas, não só as cópias entregues pela porta.
- Validação: `npm run check` verde com **97 testes**. Dois testes novos: um prova que mutar o preset lança e que o preset original fica intacto; outro, que `createPool` entrega cópia.
- Pendências: nenhuma desta tarefa. Vale a lição: `readonly` no tipo não protege nada em tempo de execução, e todo objeto compartilhado que nasce agora precisa nascer congelado.
- Posse: reservas liberadas.
- Revisão: não realizada.
