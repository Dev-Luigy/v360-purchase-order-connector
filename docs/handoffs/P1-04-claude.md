# Handoff: P1-04 — casos de uso e rotas de negócio

- Agente e data: Claude, 2026-09-28.
- Estado: concluída como código; **validação contra PostgreSQL real é ENV-03 e não aconteceu**.
- Objetivo e resultado: expor os três requisitos do enunciado. Implementado: as quatro entregas, uma por vez, cada uma com caso de uso, rota e teste antes da seguinte — ordem escolhida pelo usuário.

## As seis rotas

```
POST /clients/:clientId/ingestions    carga de pedidos, multipart
GET  /purchase-orders                 consulta com quatro filtros e paginação
GET  /purchase-orders/:id             detalhe com o que falta receber por item
POST /conferences                     conferência de nota, 201
GET  /conferences                     histórico paginado
GET  /conferences/summary             totais por resultado e por código
```

Ordem de construção pela dependência real — ingestão primeiro, porque conferir exige pedido carregado. A ordem ilustrada na pergunta começava pela conferência e teria obrigado a popular o banco à mão só para demonstrar.

## Decisões que valem defender

**Multipart em spool, não em memória.** O contrato `SourcePayload` pede fábricas de fluxo, porque o adaptador do Beta lê os cabeçalhos antes dos itens; um stream de upload é descartável e sequencial, não reabre. As partes vão para um diretório temporário exclusivo da requisição, com **nome gerado por nós** — o nome que o cliente manda nunca toca o caminho —, apagado no `finally` e varrido também na inicialização, porque `finally` não roda quando o processo morre (REVIEW-04, R04-01).

**Allowlist de partes por forma de entrega.** `nested-json` aceita `orders`; `paired-csv` aceita `headers` e `items`. Qualquer outro nome é recusado antes de qualquer escrita, e há teste mandando `../../etc/passwd` como nome de campo.

**O agregado da conferência é montado a partir do pedido carregado.** `purchaseOrderId`, `purchaseOrderIngestionVersion` e `clientId` saem do banco; da nota vem só o que a nota tem autoridade para afirmar. Isso fecha R07-04 e R07-09, que as revisões vinham apontando: antes, um chamador poderia gravar um histórico dizendo que conferiu outra coisa. O registro guarda o **valor validado**, não o objeto cru — há teste provando que um campo desconhecido não atravessa.

**Relatório com teto.** `IngestionReport` devolve amostra das rejeições e o total separado: uma carga com dez mil rejeições viraria resposta JSON sem limite (REVIEW-04, R04-02). Nada é escondido — `total - lista.length` é o que ficou de fora.

**Um lugar só para traduzir erro em status.** `toProblem` decide 400, 404, 422, 500 e 503; os handlers não escolhem. Sem isso cada rota daria um status diferente para a mesma causa. Nenhuma resposta carrega pilha ou erro do Prisma.

## Dois defeitos que os testes pegaram

1. **Falha de schema devolvia 500 em vez de 400.** Era exatamente o risco que REVIEW-07 descreveu — rejeição determinística virando erro interno. O provider Zod lança um erro próprio que o mapeamento não reconhecia.
2. **A divergência de quantidade saía como `'40'` e `docs/API.md` especifica `'40.000000'`**, que é também o que o detalhe do pedido devolve. Mesma classe do cursor `{v, after, f}`: implementação saindo do contrato aceito sem ninguém notar.

## Validação

`npm run check` verde: **169 testes**, cobertura **94,69% de linhas e 89,50% de branches**.

Os testes de rota atravessam a borda com `inject`, incluindo multipart montado à mão, e usam repositório em memória que reproduz as semânticas que importam: identidade preservada com versão incrementada, `items: null` preservando itens, e a distinção entre contar nota e contar ocorrência.

**O que não foi validado:** nada rodou contra PostgreSQL. Transação, advisory lock, `CHECK`, `RESTRICT`, cursor real e plano de consulta continuam sem prova executável.

## Pendências e próxima ação

- **ENV-03** é o caminho crítico e depende de autorização para subir o Compose.
- `@fastify/rate-limit` está registrado com quota por minuto, mas sem autenticação ele limita por IP; vira quota real quando houver identidade (REVIEW-04, R04-03).
- R07-05 segue aberto: igualdade bidirecional de tipo e a política de `strictObject` versus strip.
- O JSON aninhado ainda materializa um pedido inteiro antes do teto semântico; o `bodyLimit` limita a requisição, não o pedido.
- CI e política de auditoria continuam sem tarefa.
- Fora do escopo, não é meu: `scripts/activate-node.sh` segue apagado e o `README.md:41` ainda o referencia.
- Posse: reservas de P1-04 liberadas.
- Revisão: não realizada.
