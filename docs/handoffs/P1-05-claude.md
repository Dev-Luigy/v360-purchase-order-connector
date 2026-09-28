# Handoff: P1-05 — validar o desafio contra o enunciado

- Agente e data: Claude, 2026-09-28.
- Estado: concluída.
- Objetivo e resultado: sair de "os testes passam" para "o desafio está atendido, e eu medi". Dezoito exigências verificadas contra o serviço no ar; três defeitos encontrados, todos meus, todos corrigidos com regressão.

## O que passou a ter prova

`node scripts/validate-case.mjs` percorre o enunciado exigência por exigência contra o stack real, uma asserção por exigência. **18/18.**

| Exigência | O que é asserido                                                                    |
| --------- | ----------------------------------------------------------------------------------- |
| Parte 1   | Alfa (JSON aninhado) e Beta (dois CSV) entram pelos mesmos endpoints                |
| Req 1     | consulta unificada devolve os dois clientes com **os mesmos campos**                |
| Req 1     | filtros por cliente, fornecedor, situação e saldo pendente, e os quatro combinados  |
| Req 1     | detalhe traz pedida, recebida e o que falta, com o decimal exato                    |
| Req 2     | nota conforme aprovada; nota divergente com código, campo, esperado e recebido      |
| Req 3     | resumo com passaram/travaram/motivos; histórico paginado e filtrável                |
| Banco     | o mesmo número existe em clientes diferentes; reenvio atualiza no lugar             |
| Paginação | padrão 50, teto 100 recusado acima, envelope completo, cursor de outro filtro → 400 |

A asserção de "formato único" compara o **conjunto de campos** dos dois clientes, não só a presença de cada um: Beta entra com vírgula decimal, ponto de milhar, CNPJ mascarado e data `dd/mm/aaaa`, e sai idêntico ao Alfa.

## Volume: o item que nenhuma tarefa anterior exercitou

`node scripts/volume-check.mjs 50000 3`, contra o Compose real:

```
carga         50.000 pedidos e 150.000 itens em 189,3s (264 pedidos/s), rejeitados=0
varredura     50.000 distintos em 500 páginas, 1,8s, repetidos=0
profundidade  10 primeiras páginas 6,3ms, 10 últimas 3,4ms (0,54x)
memória       51MiB no início, plateau ~380MiB, plana durante toda a carga
```

Três coisas que só esta medição responde:

- **A profundidade é o ponto.** A última página custa **menos** que a primeira. Com `OFFSET`, a página 500 varreria 50.000 linhas para descartar 49.900; o cursor cumpre o que ADR-010 prometeu, e agora isso é número, não argumento.
- **A varredura compara conjunto de ids, não contagem.** Repetir um pedido e pular outro dá a mesma contagem e faria a plataforma reconferir nota já conferida. Zero repetidos em 500 páginas.
- **A memória não cresce com o número de pedidos.** O risco do desenho era o índice de cabeçalhos do Beta, que é proporcional à quantidade de pedidos. Medido do zero: sobe a ~375MiB nos primeiros segundos e fica plana (374,8 → 382,5MiB) enquanto os pedidos iam de ~5 mil a 50 mil. Dez vezes mais pedidos, 2% mais memória.

Incidentalmente, a segunda carga dos mesmos 20.000 números terminou com 20.005 pedidos e versão máxima 2: idempotência do reenvio provada em escala, não só no teste de integração.

## Três defeitos, todos meus

**1. Recusa do framework virava 500.** O `@fastify/rate-limit` marca o erro com `statusCode: 429`; `toProblem` não olhava esse campo e caía no caso genérico. O cliente estrangulado recebia `erro_interno` em vez de 429 com o tempo de espera — e foi assim que a varredura quebrou, com uma mensagem que não dizia nada. Generalizar em vez de tratar o 429 como caso isolado revelou que **413** (corpo acima do teto) tinha o mesmo destino. Passam a ser honrados os 4xx que o framework já decidiu; 5xx continua no caso genérico, para a mensagem interna não escapar.

**2. O teto de requisições estrangulava o próprio caso de uso.** Eram 120/min, número que eu escolhi sem medir. A varredura noturna de dezenas de milhares de pedidos em páginas de 100 precisa de centenas de requisições: o padrão derrubava a operação que o sistema existe para servir. Passa a 1200/min e a ser configurável por `RATE_LIMIT_MAX` e `RATE_LIMIT_WINDOW`, porque o valor certo depende do ambiente, não do código.

**3. `docs/API.md` estava inutilizável em toda a superfície de ingestão.** A doc dizia `X-Source-Format-Version` e o código exige `x-format-version`; a doc dizia partes `purchase-orders`, `cabecalho` e `itens` e o código aceita `orders`, `headers` e `items`. **Todos** os nomes da Parte 1 errados: quem seguisse a documentação recebia 400 e não carregava nada. Só apareceu porque escrevi a validação lendo a doc em vez de o código — que é a razão de ela existir.

É a mesma classe de defeito de FIX-05 e FIX-08: **duas fontes de verdade que ninguém obriga a concordar.** Por isso a correção não foi só a linha. `tests/contrato-documentado.test.ts` lê `docs/API.md` e o schema da rota e obriga cabeçalho, nomes de parte e limites de página a coincidirem. Cada deriva foi reintroduzida e a falha confirmada antes de eu aceitar o teste.

## Limitações que a medição revelou e eu não fechei

- **A carga de 50.000 pedidos é uma requisição HTTP de 3,2 minutos.** Funciona no Compose, onde não há proxy no meio. Qualquer balanceador com tempo limite padrão de 60s derruba a conexão, e hoje não há retomada: o cliente reenvia tudo. Ingestão assíncrona com protocolo de acompanhamento é o desenho certo, e é mudança de contrato — não cabia em P1-05 sem decisão registrada.
- **O teto de requisições é por origem, não por identidade.** Sem autenticação — que o enunciado explicitamente não pede — todos os clientes atrás do mesmo IP dividem a mesma quota. Vira quota real quando houver identidade.
- **Windows-1252 e CRLF têm teste unitário em `csv-stream`, não fixture ponta a ponta.** O enunciado levanta o ponto ("uma fixture de variante deveria provar isso"); o decodificador está provado, o caminho HTTP com arquivo de ERP real não.
- **`eslint.config.js` mantém a lista de globals de `scripts/**` à mão.** Acrescentei `FormData` e `URL`; a lista vai crescer a cada script. O pacote `globals` resolveria, mas é dependência nova para dois nomes e não passa da regra do projeto.

## Pendências e próxima ação

- **DOC-02 é o que falta antes da tag.** O enunciado trata o README como artefato avaliado e cobra nele a defesa das regras de conferência, a política de reenvio e a decisão do Delta. O README atual não tem nenhuma das três. Marcar `parte-1` antes disso seria marcar o marco com o artefato avaliado incompleto.
- Estado deixado: Compose no ar com os dados da validação. `docker compose down -v` limpa.
- Posse: reservas de P1-05 liberadas; `src/presentation/http/{app,problem}.ts`, `src/infrastructure/config/env.ts`, `src/main/server.ts` e `eslint.config.js` foram alterados por esta tarefa e estão liberados.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam alterações de CLEAN-01 do Codex; `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
