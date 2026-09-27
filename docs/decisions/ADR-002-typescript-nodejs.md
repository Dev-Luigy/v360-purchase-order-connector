# ADR-002 — TypeScript e Node.js

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Codex; tarefa ARCH-02.
- Aceite: usuário confirmou nesta conversa que a linguagem já foi escolhida e explicou o mesmo critério para Node.js.

## Contexto e decisão

Usaremos TypeScript como linguagem e Node.js como runtime. O critério principal é a manutenibilidade: facilitar a continuidade do projeto e encontrar desenvolvedores com experiência na stack.

Na avaliação do usuário, é mais fácil encontrar profissionais familiarizados com TypeScript ou Python do que com Go; para o runtime, a familiaridade com Node.js favorece sua escolha frente a Bun ou outras alternativas. Essa é a justificativa de seleção do projeto, não uma medição de mercado feita nesta tarefa.

Python e Go foram referências na discussão de linguagem; Bun foi uma alternativa mencionada para runtime. A decisão não depende de alegar superioridade de desempenho de TypeScript ou Node.js.

## Impacto e limites

Confirma a linguagem e o runtime já presentes na base (`src/`, `tsconfig*.json`, `package.json` e `Dockerfile`). Complementa ADR-001: a ressalva daquele registro sobre linguagem pendente foi resolvida por esta decisão.

Nenhuma mudança de código ou migração é necessária. A versão de Node existente não foi objeto de nova escolha. Framework HTTP, gerenciador de pacotes, acesso ao banco e demais ferramentas permanecem em discussão; o aceite não se estende automaticamente a eles.

## Validação e pendências

Mudança documental, verificada por formatação. Nas tarefas de implementação, validar tipagem, testes e execução no runtime adotado. Próximo tema: comparar frameworks HTTP à luz da manutenção e do escopo do desafio.
