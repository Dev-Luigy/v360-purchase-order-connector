# Documentação de engenharia

Índice de leitura. Cada documento tem uma responsabilidade; quando precisar de
detalhes completos, consulte a fonte indicada em vez de copiar seu conteúdo.

## Entender o sistema

1. [As partes difíceis](HARD-PARTS.md): **comece por aqui para entender o
   porquê.** Treze problemas que o projeto teve, cada um em quatro movimentos —
   o problema, por que a resposta óbvia falha, a decisão e como está provada.
2. [Guia do projeto](PROJECT-GUIDE.md): mapa da arquitetura, fluxo principal,
   glossário e roteiro para conhecer o código. Responde _onde fica_; o
   documento acima responde _por quê_.
3. [Diagramas](diagrams/README.md): modelo de classes/contratos e processos,
   derivados do código atual.
4. [Contrato HTTP](API.md): rotas, formatos, exemplos de requisição/resposta e
   erros.
5. [Decisões técnicas](decisions/README.md): motivação e histórico das
   escolhas. Não substitui o código nem o contrato HTTP.

## Executar e colaborar

- [Setup](SETUP.md): preparar dependências, ambiente local e banco.
- [Status](STATUS.md): retrato atual, validações e limitações conhecidas.
- [Tarefas](TASKS.md): responsabilidade, estado e evidência do trabalho.
- [Colaboração](COLLABORATION.md): regras compartilhadas entre responsável,
  Codex e Claude.

## Referências do desafio

- [Enunciado transcrito](CASE.md)
- [ADRs](decisions/README.md)
- [Diagramas do contrato normalizado](diagrams/README.md)

O princípio editorial é simples: `HARD-PARTS.md` explica os problemas e a
engenharia que resolveu cada um; `API.md` define o contrato externo; ADRs
registram cada decisão com o seu contexto; `PROJECT-GUIDE.md` ensina a navegar;
diagramas mostram relações/fluxos; `STATUS.md` e `TASKS.md` registram situação e
responsabilidade. Evitar registrar o mesmo inventário detalhado em vários
lugares.
