# Instruções compartilhadas — Codex e Claude

Este arquivo é a fonte única das regras de colaboração. Instruções explícitas do usuário têm prioridade.

## Entrada e escopo

1. Na entrada ou retomada sem contexto, ler `README.md`, `docs/COLLABORATION.md`, `docs/STATUS.md` e `docs/TASKS.md`. Durante a mesma sessão, reler os registros que mudaram antes de assumir ou entregar trabalho; não repetir leituras integrais sem necessidade.
2. Consultar `docs/TASKS.md`; registrar responsável e arquivos antes de iniciar uma tarefa. Não assumir que uma proposta de atribuição significa trabalho em andamento.
3. O escopo atual é preparar a base. Funcionalidades do desafio serão desenvolvidas nas próximas tarefas. O usuário instalará as dependências do sistema; não executar instalações ou mudanças de serviço por conta própria.
4. Preservar TypeScript, Fastify, PostgreSQL e SOLID. Manter a justificativa de manutenção e familiaridade do TypeScript.

## Código

- Domínio não importa HTTP, banco ou ambiente. Casos de uso dependem de interfaces pequenas; composição em `src/main`.
- Adaptadores normalizam fontes; regras de conferência não conhecem clientes específicos.
- Usar TypeScript estrito e npm com lockfile. Não adicionar framework, ORM ou biblioteca sem necessidade concreta documentada.
- Não usar ponto flutuante para cálculos monetários. Todas as listas de negócio precisam de paginação.
- Implementar Alfa/Beta antes de Gama/Delta. Marcar `parte-1` somente após implementação e validação completas.
- Não registrar segredos ou dados reais de clientes em fixtures, logs ou documentos.

## Trabalho conjunto

- Um responsável por tarefa e por arquivo editado; o outro pode revisar sem modificar os mesmos arquivos.
- Não sobrescrever, reverter ou limpar alterações do outro agente. Ao encontrar conflito de responsabilidade, escolher tarefa independente ou alinhar pelo quadro.
- Alterações de contratos, schema, dependências e configuração compartilhada precisam ser registradas antes do trabalho dependente.
- Não alterar lockfile simultaneamente. Não executar formatação global enquanto outro agente edita: formatar só os arquivos da tarefa.
- Antes de entregar, executar os checks pertinentes; `npm run check` na integração final. Informar o que passou e o que não pôde ser verificado.
- Atualizar o estado da tarefa e o handoff com arquivos, decisões, comandos, resultados e pendências. Não afirmar que o outro agente revisou sem evidência.

## Contexto econômico

- Seguir o mapa de leitura em `docs/COLLABORATION.md`; abrir plano, setup, decisões e handoffs apenas quando relevantes à tarefa.
- Buscar caminhos e símbolos com `rg --files` e `rg -n`; ler os trechos necessários e ampliar quando houver dependências ou dúvidas.
- Trocar resultado, evidência e próximo passo por handoff; não copiar conversas, raciocínio interno ou logs completos.
- Cada fato tem uma fonte: posse em `TASKS.md`, situação em `STATUS.md`, decisões em `docs/decisions/`, evidência da tarefa em `docs/handoffs/`. Referenciar em vez de duplicar.
- Resumos podem ficar desatualizados: conferir código e evidências antes de agir; registrar divergências sem tratar planos como implementação.
