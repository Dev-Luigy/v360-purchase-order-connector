# Documentação de engenharia

Índice de leitura. Cada documento tem uma responsabilidade; quando precisar de
detalhes completos, consulte a fonte indicada em vez de copiar seu conteúdo.

## Entender o sistema

1. [Guia do projeto](PROJECT-GUIDE.md): mapa da arquitetura, fluxo principal,
   glossário e roteiro para conhecer o código.
2. [Diagramas](diagrams/README.md): modelo de classes/contratos e processos,
   derivados do código atual.
3. [Contrato HTTP](API.md): rotas, formatos, exemplos de requisição/resposta e
   erros.
4. [Decisões técnicas](decisions/README.md): motivação e histórico das
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

O princípio editorial é simples: `API.md` define o contrato externo; ADRs
explicam por que uma decisão foi tomada; `PROJECT-GUIDE.md` ensina a navegar;
diagramas mostram relações/fluxos; `STATUS.md` e `TASKS.md` registram situação e
responsabilidade. Evitar registrar o mesmo inventário detalhado em vários
lugares.
