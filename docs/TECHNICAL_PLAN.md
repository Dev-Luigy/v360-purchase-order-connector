# Plano técnico do desafio

Referência de planejamento; não comprova implementação. Consulte [STATUS.md](STATUS.md) para o estado e [decisions/README.md](decisions/README.md) para decisões posteriores.

As decisões abaixo orientam a implementação e ainda precisam de código e testes.

### Parte 1 — Alfa e Beta

1. Criar migrações de pedidos, itens, conferências e divergências. Identificar pedidos por `(client_id, external_number)` e itens por `(purchase_order_id, external_line)`. Manter ID interno imutável, fornecedor com CNPJ normalizado, moeda, situação, data do pedido, unidade e quantidades pedida/recebida. Planejar índices em `(client_id, id)`, `(supplier_tax_id, id)` e `(status, id)`, além de índice parcial para saldo pendente, conforme o modelo final e planos de consulta.
2. Implementar adaptador Alfa para JSON aninhado e Beta para dois CSVs separados por `;`. Tratar datas brasileiras, vírgula decimal, milhar e máscara de CNPJ explicitamente; não confiar em conversão numérica genérica. Validar entradas em lotes limitados para não exigir todo o volume em memória.
3. Reenvios: atualizar atomicamente o pedido e seus itens como um retrato completo, mantendo identidade interna e histórico de conferências imutável. Registrar versão/data de ingestão e serializar alterações do mesmo pedido. Como as fontes não informam versão confiável, documentar que prevalece a última carga aceita; cargas antigas podem regredir o retrato e exigirão política adicional se precisarmos impedi-lo.
4. Consultar pedidos com filtros combináveis por cliente, fornecedor, situação e saldo. Usar cursor por ID imutável, limite padrão 50 e máximo 100, retornando cursor atual, próximo cursor e `hasMore`. Vincular cursor aos filtros. Um limite superior de ID na primeira página exclui novas inserções do percurso; não congela atualizações que alteram filtros. Para uma varredura consistente mesmo durante atualizações, implementar snapshot persistido dos resultados ou versionamento consultável. Resolver e testar essa estratégia antes de concluir a Parte 1.
5. Conferir fornecedor, situação aberta, existência do material, quantidade positiva e dentro do saldo, e valor total contra quantidade × preço acordado. Usar aritmética decimal e política explícita de arredondamento por moeda. Agregar linhas repetidas da nota antes de validar saldo. Se um material identificar várias linhas do pedido e não houver linha na nota, retornar divergência de ambiguidade até definir regra de alocação. Conferir não significa receber: não consumir saldo automaticamente.
6. Persistir entrada, resultado, versão do pedido e divergências estruturadas (código, campo/linha, esperado e recebido). Relatórios devem trazer totais aprovados/reprovados, motivos e histórico paginado. Diferenciar contagem de notas e ocorrências de divergências.
7. Testar persistência após reinício, filtros com paginação, reingestão, precisão e concorrência. Documentar contratos e exemplos; só então criar o commit/tag `parte-1` solicitado pelo desafio.

### Parte 2 — Gama e Delta

Implementar apenas depois do marco da Parte 1, preservando a possibilidade de comparar as mudanças.

- **Gama:** agrupar linhas por pedido; converter timestamp em segundos, códigos de situação e centavos. Converter quantidades de caixas para unidades com o fator e dividir preço da caixa pelo mesmo fator, sem arredondar prematuramente preços periódicos. A moeda não é enviada; a hipótese BRL deve ser registrada e validada. Dados de cabeçalho repetidos precisam ser consistentes.
- **Delta:** reutilizar conversores de campos do Alfa, mas compor cabeçalhos e itens por `purchase_order`. Preservar separadamente as datas do pedido e da linha. Proposta: manter dados sem correspondência em staging para reconciliação futura; não disponibilizar pedido incompleto para conferência nem apagar itens previamente válidos por ausência em uma consulta parcial. Definir como uma carga passa a ser considerada completa.
- Registrar o que foi adicionado, o que precisou mudar e quais migrações foram necessárias. Não antecipar a implementação desses adaptadores na Parte 1.
