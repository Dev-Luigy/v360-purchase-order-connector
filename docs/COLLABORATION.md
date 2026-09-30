# Colaboração entre Codex e Claude

## Organização inicial proposta

| Frente                                                   | Implementação proposta          | Revisão proposta |
| -------------------------------------------------------- | ------------------------------- | ---------------- |
| Ambiente, banco, migrações, repositórios e composição    | Codex                           | Claude           |
| Domínio, regras de conferência e adaptadores de clientes | Claude                          | Codex            |
| Contratos, API HTTP e integração final                   | Responsável definido por tarefa | Outro agente     |

Essa divisão é ajustável e não representa tarefas já aceitas. O quadro `TASKS.md` registra a posse real. Nenhum agente deve iniciar a implementação de negócio apenas por ler esta proposta.

## Papel do responsável pelo projeto

O responsável pelo projeto decide ou confirma tecnologias, escopo e prioridades; define critérios de aceite; revisa as evidências; e aceita ou devolve cada entrega. Essas decisões ficam registradas nos ADRs e nas tarefas. Claude e Codex podem implementar e executar verificações, mas seus handoffs devem nomear quem fez cada atividade. A assistência de IA não deve ser apresentada como autoria humana do código.

## Fluxo

1. Ler o estado e as mudanças existentes. Com Git disponível, conferir `git status --short` e `git diff`.
2. Escolher uma tarefa liberada e registrar agente, estado, arquivos previstos e dependências no quadro. No mesmo diretório, a tomada de tarefa deve ocorrer em sequência: o quadro não oferece bloqueio automático.
3. Definir contratos antes de desenvolver consumidores em paralelo. Documentar decisões em `docs/decisions/` quando surgirem.
4. Trabalhar somente no escopo assumido. Arquivos compartilhados (`package*.json`, `compose.yaml`, configurações, contratos e quadro) têm um editor por vez.
5. Fazer handoff seguindo `HANDOFF_TEMPLATE.md` e passar a tarefa para revisão. Revisão sem edição pode ocorrer paralelamente.
6. Integrar e executar `npm run check`; validar banco e Compose quando Docker estiver disponível. Marcar concluída somente com evidência.

## Mesmo diretório ou worktrees

A convenção de branches, commits, merge e tags está em [GIT_WORKFLOW.md](GIT_WORKFLOW.md): uma branch por tarefa do quadro, integração em `main`.

No workspace compartilhado, alternar edições dos mesmos arquivos e não trocar branches enquanto o outro agente trabalha. Não executar `git reset --hard`, `git clean`, restauração de arquivos alheios ou commits abrangendo trabalho não revisado do outro.

Para trabalho simultâneo mais amplo, preferir worktrees e branches por tarefa depois de inicializar um repositório e criar o primeiro commit. Confira a raiz com `git rev-parse --show-toplevel` e a existência do primeiro commit antes de criar worktrees; o estado do Git pode mudar entre sessões.

## Handoff

Salvar um registro por tarefa em `docs/handoffs/ID-agente.md`, usando o template. Registrar limitações do ambiente como limitações, nunca como checks aprovados. Não há comunicação automática entre sessões: estes arquivos são o ponto de continuidade.

## Memória compartilhada e mapa de leitura

Os arquivos são a memória comum. Não há sincronização de conversas, entrega automática de mensagens ou bloqueio de arquivos. Não é necessário RAG, servidor MCP ou instalação adicional para este fluxo.

| Fonte                        | Conteúdo e momento de leitura                                                    |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `AGENTS.md`                  | Regras comuns; entrada de ambos os agentes. `CLAUDE.md` apenas aponta para elas. |
| `README.md`                  | Visão geral e execução; entrada.                                                 |
| `docs/COLLABORATION.md`      | Protocolo e mapa; entrada.                                                       |
| `docs/STATUS.md`             | Resumo atual e limitações; entrada e retomada.                                   |
| `docs/TASKS.md`              | Posse, arquivos, dependências e estado por tarefa; antes de assumir e entregar.  |
| `docs/TECHNICAL_PLAN.md`     | Planejamento de negócio; somente nas tarefas da etapa correspondente.            |
| `docs/GIT_WORKFLOW.md`       | Branches, commits, merge e tags; ao iniciar e ao integrar uma tarefa.            |
| `docs/CASE.md`               | Enunciado do desafio e pontos que ele não fecha; nas tarefas de negócio.         |
| `docs/SETUP.md`              | Instalação e ambiente; somente em tarefas de ambiente.                           |
| `docs/decisions/README.md`   | Índice de decisões; consultar nas mudanças de contratos, schema e arquitetura.   |
| `docs/diagrams/README.md`    | Objetos e portas desenhados; ao mudar o contrato e ao entrar em P1-02 ou P1-03.  |
| `docs/handoffs/ID-agente.md` | Resultado, evidências e pendências; ler o da tarefa e os de suas dependências.   |
| Código e testes              | Implementação real; localizar por caminho/símbolo e ler conforme a tarefa.       |

## Passagem e retomada de trabalho

1. Identificar o ID no quadro e ler seu registro, dependências e handoff existente. Se a tarefa estiver ocupada, não assumir a edição dos mesmos arquivos.
2. Registrar objetivo, responsável, arquivos reservados e dependências antes da primeira edição. Quando possível, incluir links para decisões e handoffs relevantes no registro da tarefa.
3. Usar buscas focadas, por exemplo `rg -n 'DatabaseHealth' src tests`. Evitar carregar todas as pastas ou o histórico inteiro de handoffs. Ampliar a leitura se o resumo não for suficiente.
4. Ao terminar ou interromper, preencher o handoff com fatos verificáveis. Preferir até cerca de 300 palavras; acrescentar detalhes necessários para segurança e correção, usando links para artefatos extensos.
5. Atualizar a própria tarefa no quadro e somente o que mudou no estado global. Liberar a reserva ao concluir; em revisão, manter explícito quem pode editar. O revisor pode deixar o resultado em seu próprio `ID-agente.md` sem editar arquivos reservados.
6. Quem retoma confirma os arquivos e a validade das evidências. Um teste executado antes de mudanças posteriores não comprova a versão atual. Pendências de outra tarefa não devem ser encerradas por inferência.

Uma mensagem de encaminhamento pode conter apenas: `Retome <ID>; leia docs/TASKS.md e docs/handoffs/<ID>-<agente>.md; execute o próximo passo registrado.` Isso é um modelo, não uma mensagem enviada automaticamente.

Evitar duplicar estados e decisões em vários documentos. Manter `STATUS.md` como resumo curto; guardar o histórico e comandos nos handoffs. Uma proposta em um handoff não altera um contrato aceito: registrar a decisão e seus consumidores antes de implementar a mudança.
