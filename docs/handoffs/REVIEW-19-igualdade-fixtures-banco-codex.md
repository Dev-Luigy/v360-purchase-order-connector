# REVIEW-19 — igualdade entre fixtures de entrada e dados persistidos

- Responsável: Codex; 2026-09-29.
- Estado: concluída.
- Objetivo: inserir os dados de exemplo pela aplicação e confirmar que os valores gravados no PostgreSQL correspondem às entradas após as normalizações declaradas.
- Escopo: fixtures de Alfa, Beta, Gama e Delta. Nenhum código de produção ou fixture foi alterado.

## Método e resultado

Reenviei `tests/fixtures/{alfa,beta,gama,delta}` pelas quatro rotas HTTP de ingestão; todas responderam HTTP 200, sem rejeições:

| Cliente | Cabeçalhos aceitos | Itens no pedido |  Espera |
| ------- | -----------------: | --------------: | ------: |
| Alfa    |                  1 |               2 |       0 |
| Beta    |                  2 |               3 |       0 |
| Gama    |                  2 |               3 |       0 |
| Delta   |                  3 |               3 | 1 órfão |

Em seguida, busquei cada pedido pelo endpoint de consulta e comparei campos do cabeçalho e **todos os campos dos itens** com os valores esperados derivados da fixture: fornecedor/CNPJ, moeda, situação, data, linha, material, descrição, unidade, fator, quantidade pedida/recebida, saldo, preço e data própria do item. Para validar a camada de armazenamento separadamente da serialização da API, também consultei diretamente as tabelas PostgreSQL: os oito cabeçalhos e onze itens coincidem com o que retornou pela aplicação.

| Entrada                                       | Exemplo de valor na origem     | Valor confirmado no banco                                                     |
| --------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| Alfa: preço JSON `45.9`, linha `MAT-1001`     | quantidade 100; recebido 60    | preço `45.900000`; pendente `40.000000`                                       |
| Beta: `1.200,000`, preço `6,49`               | CSV brasileiro com separadores | `1200.000000`; `6.490000`; CNPJ sem máscara                                   |
| Gama: 120.000 centavos, fator 12              | 10 caixas; 2 recebidas         | preço `1200.000000`; fator `12.000000`; pedido continua 10 caixas, pendente 8 |
| Delta: linha criada em 08/09, pedido de 02/09 | datas distintas                | cabeçalho `2026-09-02`; `lineCreatedOn=2026-09-08`                            |

Decimais aparecem com escala seis por contrato/schema; os valores numéricos continuam exatamente iguais, sem conversão para ponto flutuante. No Gama, `dt_criacao` informa a data do pedido, e o perfil deixa `lineCreatedOn` nulo; não há perda de uma data de linha nessa fixture. O pedido completamente recebido GL-779 tem saldo zero e `hasPendingBalance=false`; DL-2026-0046, que só tem cabeçalho, permanece com zero itens.

## Órfão Delta

`DL-2026-0099` só aparece em `items.json`. A resposta da carga reportou `stagedTotal=1` e referência `DL-2026-0099`; PostgreSQL confirma que não existe cabeçalho/pedido com esse número. A linha em `ingestion_staging` guarda material `EMB-500`, descrição, linha 10, unidade `UN`, data `2026-09-15`, quantidades 100/0, fator 1 e preço 3.75, iguais à origem após normalização.

Há **cinco linhas físicas** idênticas dessa referência no staging, cada uma com `ingestion_id` diferente. Elas vieram de ingestões repetidas das mesmas fixtures. Essa coexistência é intencional: testes de integração verificam que cargas diferentes convivem e que a última prevalece quando o cabeçalho chega, sem duplicar a linha do pedido. A resposta da ingestão atual contabiliza somente o item desta carga. Não apaguei staging ou dados de negócio para reduzir a contagem.

## Conclusão

Para os exemplos conferidos, não encontrei divergência entre a entrada, o modelo normalizado, o retorno da leitura e os registros PostgreSQL. Escopo da igualdade: todos os campos de cabeçalho e de item para os oito pedidos da amostra e o item órfão Delta em staging; não é uma auditoria de todas as linhas de negócio preexistentes no banco.

Estado e posse da revisão: [TASKS.md](../TASKS.md). Estado consolidado: [STATUS.md](../STATUS.md).
