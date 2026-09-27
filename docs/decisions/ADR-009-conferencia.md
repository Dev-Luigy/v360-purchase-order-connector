# ADR-009 — Conferência e taxonomia de divergências

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Claude; tarefa P1-01.
- Autoridade: decisão de engenharia da tarefa. O enunciado é explícito: as regras não existem como especificação, saem do entendimento do negócio, e precisam ser defendidas.

## Regras

A plataforma envia fornecedor e, por item, material, quantidade e valor total. Conferimos, nesta ordem:

1. **Fornecedor** da nota igual ao do pedido, comparando CNPJ normalizado → `FORNECEDOR_DIVERGENTE`.
2. **Situação** do pedido igual a `aberto`. Encerrado ou bloqueado não recebe → `PEDIDO_NAO_ABERTO`.
3. **Material existe** em alguma linha do pedido → `MATERIAL_NAO_ENCONTRADO`.
4. **Material não ambíguo:** se o material aparece em mais de uma linha do pedido e a nota não identifica a linha, devolvemos `MATERIAL_AMBIGUO` em vez de escolher. Não existe regra de alocação combinada, e adivinhar mudaria o saldo da linha errada.
5. **Quantidade positiva** → `QUANTIDADE_NAO_POSITIVA`.
6. **Quantidade dentro do saldo**, com as linhas repetidas da nota para o mesmo material **agregadas antes** da comparação — senão duas linhas de 60 passariam contra um saldo de 100 → `QUANTIDADE_ACIMA_DO_SALDO`.
7. **Valor total** igual a `quantidade ÷ fator × preço por unidade de compra`, arredondado ao final para a escala da moeda (ADR-007) → `VALOR_TOTAL_DIVERGENTE`.

**Conferir não é receber.** A conferência não consome saldo. A quantidade recebida é dado do sistema do cliente e só muda por ingestão; se a conferência a consumisse, o número divergiria da fonte na primeira carga seguinte.

**Todas as divergências, não a primeira.** O enunciado exige que a plataforma mostre o que não bate "sem adivinhar nada", então avaliamos todas as linhas e devolvemos a lista completa. Aprovada significa lista vazia.

**Pedido inexistente não é divergência da nota**: é `404`. A nota pode estar correta e o pedido simplesmente não ter sido carregado ainda.

## Histórico e relatório

A conferência persiste o **retrato do que foi comparado**: a nota recebida, a versão de ingestão do pedido (`purchaseOrderIngestionVersion`) e as divergências estruturadas com código, campo, linha da nota, linha do pedido, esperado e recebido. Sem esse retrato, uma reingestão mudaria retroativamente o sentido do histórico, e o relatório do requisito 3 passaria a descrever outra coisa ([REVIEW-02](../handoffs/REVIEW-02-claude.md), item 4).

O relatório distingue **contagem de notas** de **contagem de ocorrências**: uma nota reprovada pode ter várias divergências, então a soma por código não fecha com o total de reprovadas. O histórico é paginado (ADR-010); os totais vêm em recurso próprio, com cardinalidade limitada pela taxonomia fechada.

A taxonomia é fechada de propósito: a plataforma mostra motivo ao usuário sem interpretar texto livre, e código novo é mudança de contrato, consciente.

## Pendências

Tolerância monetária configurável não foi implementada (ADR-007). Regra de alocação para material em múltiplas linhas depende de a nota passar a identificar a linha. Se a nota trouxer moeda no futuro, entra uma divergência de moeda.
