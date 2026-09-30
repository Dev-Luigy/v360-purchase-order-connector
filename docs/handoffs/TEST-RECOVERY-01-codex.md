# TEST-RECOVERY-01 — queda, retry e cabeçalho ausente

- Responsável: Codex; 2026-09-30.
- Estado: concluída.
- Arquivo de teste: `tests/integration/recovery.test.ts`.
- Escopo: reproduzir reinícios reais do servidor, staging Delta, recuperação, expurgo de carga abandonada e igualdade persistida para centenas de pedidos gerados.

## Matriz executada

O teste usa `fast-check` com seed fixa `20260930` para gerar **250 pedidos Delta e 766 linhas** (1–5 linhas por pedido). Contra um PostgreSQL descartável e a API real:

1. Envia os itens sem cabeçalho; os 766 viram espera publicada, sem pedido inventado.
2. Cria outras 766 linhas no estado não publicado, envelhece-as para simular processo morto entre gravação e fechamento e deixa uma linha ativa recente como controle.
3. Mata o processo API com `SIGKILL` e sobe outro processo contra o mesmo banco.
4. Confirma que as 766 linhas publicadas sobreviveram, as 766 abandonadas foram removidas e a linha recente não foi apagada.
5. Reenvia as 766 linhas abandonadas; repete os 766 itens publicados com alteração de descrição, quantidade e preço para exercitar “última carga aceita vence”.
6. Envia 500 cabeçalhos e compara diretamente no PostgreSQL todos os cabeçalhos e **1.532 itens**. O relatório recupera 1.532 itens, sem recusas, perda ou linha duplicada. A linha ativa ainda não publicada continua isolada e o restante do staging das cargas concluídas foi consumido.

## Resultados

- `npm run check`: aprovado; tipagem, lint, formatação, suíte sem banco e build.
- `npm run test:integration`: **34/34**, zero falhas/ignorados, em PostgreSQL descartável.
- O teste gerado termina em cerca de 8 segundos no ambiente desta execução.
- `docker stop` removeu o contêiner temporário; nenhuma tabela do banco persistente da aplicação foi truncada ou usada por esta suíte.
- `git diff --check` e Prettier: aprovados.

A comparação confere igualdade após a normalização do contrato: não espera igualdade textual entre a representação de origem e `NUMERIC(30,6)`. Os valores persistidos são comparados como decimais exatos, linha, unidade, data, preço, quantidades e saldo.
