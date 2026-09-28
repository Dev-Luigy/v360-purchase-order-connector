# Handoff: ENV-03 — Compose, banco real e suíte de integração

- Agente e data: Claude, 2026-09-28.
- Estado: concluída.
- Autorização: o usuário liberou explicitamente subir serviço e mexer no banco, o que o `AGENTS.md` reservava a ele.
- Objetivo e resultado: sair do "o código existe e nada foi executado". O Compose subiu do zero, a migração foi aplicada, e a suíte de integração prova o que nenhum teste unitário alcançava.

## O que passou a ter prova

`npm run test:integration`: **16 testes**, estáveis em quatro execuções seguidas.

- **Transação e advisory lock.** Duas cargas simultâneas do mesmo pedido concluem as duas, criam **uma** linha e a versão termina em 2. Sem o lock, as transações não enxergam uma à outra e o unique de `(clientId, externalNumber)` derrubaria uma delas.
- **Reenvio.** Identidade interna preservada, versão incrementada, saldo recalculado.
- **`items: null` versus `[]`.** O primeiro aplica o cabeçalho e preserva os itens; o segundo os remove e zera o saldo.
- **Os nove `CHECK`.** Fator zero, saldo incoerente com pedido menos recebido e CNPJ não numérico são recusados pelo banco, não só pela aplicação.
- **`RESTRICT` do histórico.** Apagar um pedido que já tem conferência é recusado pela chave estrangeira.
- **Ordem das divergências.** A coluna `position` faz a ordem das regras sobreviver à ida e volta; UUID v7 sozinho não garantiria.
- **Paginação por cursor.** Vinte e cinco pedidos em páginas de dez: todos apareceram, nenhum duas vezes. Trocar de filtro com o cursor anterior é recusado.
- **Reingestão não reescreve o histórico.** A conferência antiga continua apontando a versão que conferiu.

## Os índices, medidos e não supostos

REVIEW-02 e REVIEW-05 pediram `EXPLAIN`. O primeiro teste que escrevi estava errado: eu semeava 200 pedidos **de um cliente só**, e o planejador preferia o índice parcial mais estreito — porque filtrar por cliente não selecionava nada. Com dois clientes, que é o caso real, cada caminho usa o índice desenhado para ele, sem forçar `enable_seqscan`:

| Consulta                                 | Índice escolhido                        |
| ---------------------------------------- | --------------------------------------- |
| cliente + saldo pendente, ordem por `id` | `purchase_order_pending_by_client_idx`  |
| saldo pendente sem cliente               | `purchase_order_pending_idx`            |
| fornecedor, ordem por `id`               | `purchase_order_supplier_tax_id_id_idx` |

Os dois primeiros são os índices parciais escritos à mão, que o schema do Prisma não declara.

## Persistência, a exigência explícita do enunciado

`node --env-file=.env scripts/verify-persistence.mjs` semeia pedido, item, conferência e divergência, reinicia o container e recontamos: **os quatro sobrevivem**. Ficou fora da suíte de propósito — reiniciar container é operação de ambiente, e misturá-la tornaria `npm run test:integration` refém do Docker.

## `docker compose up` entrega um sistema utilizável

Do zero, com o volume apagado: `db` sobe, `migrate` aplica `0001_contrato_normalizado` e termina, `api` só então inicia, e `/ready` responde 200 — ou seja, a prontidão confirmou o schema, não só a conexão. Isso fecha os achados 1 e 2 de REVIEW-02.

Exercício completo contra o stack real, por HTTP:

```
carga Alfa  (JSON aninhado)  pedidos=1 itens=2 rejeitados=0
carga Beta  (dois CSV)       pedidos=2 itens=3 rejeitados=0
consulta unificada           alfa 4500001234 · beta 20260088412 · beta 20260088413
cursor                       segunda página correta; trocar filtro → 400 cursor_invalido
conferência aprovada         versão do pedido conferida = 1
conferência reprovada        PEDIDO_NAO_ABERTO · VALOR_TOTAL_DIVERGENTE · QUANTIDADE_ACIMA_DO_SALDO
relatório                    conferidas=2 aprovadas=1 reprovadas=1; ocorrências=3
detalhe                      falta=40.000000 (consumo=40.000000) preço=45.900000
```

O decimal atravessou adaptador, HTTP, `NUMERIC(30,6)` e volta sem virar ponto flutuante.

## Decisões e limites desta tarefa

- **A suíte roda em série** (`--test-concurrency=1`). Os arquivos compartilham um banco e o `TRUNCATE` de um apagava os dados do outro — foi o que aconteceu na primeira execução dos dois arquivos juntos. Isolar por schema seria mais rápido e menos parecido com produção.
- **A suíte assume acesso exclusivo ao banco.** Uma execução falhou com a API do Compose ativa segurando conexões. No CI isso não acontece, porque o banco é efêmero e dedicado; localmente, convém parar a API antes.
- **Sem banco, os 16 testes são `skip`, não falha.** `npm run check` continua funcionando em máquina sem Docker: são 169 testes ali e 185 no total.

## Pendências e próxima ação

- **P1-05 está destravada**: persistência, concorrência, precisão e paginação agora têm prova executável, que é exatamente o que ela cobra.
- CI e política de auditoria continuam sem tarefa; o banco efêmero do pipeline é onde esta suíte deveria rodar a cada PR.
- O papel de runtime ainda usa a mesma credencial da migração; separar DDL de DML fica para quando houver ambiente implantado (REVIEW-04, R04-05).
- Fora do escopo, não é meu: `scripts/activate-node.sh` segue apagado e o `README.md:41` ainda o referencia.
- Estado deixado: Compose no ar com dados do exercício. `docker compose down -v` limpa tudo.
- Posse: reservas de ENV-03 liberadas.
- Revisão: não realizada.
