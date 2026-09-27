# Fixtures dos clientes

Amostras do enunciado ([docs/CASE.md](../../docs/CASE.md)), reproduzidas na forma em que cada cliente entrega. São dados fictícios do próprio desafio.

| Pasta    | Arquivos                     | Formato                                              |
| -------- | ---------------------------- | ---------------------------------------------------- |
| `alfa/`  | `purchase-orders.json`       | JSON, itens aninhados no pedido                      |
| `beta/`  | `cabecalho.csv`, `itens.csv` | CSV `;`, padrão brasileiro, ligados pelo número      |
| `gama/`  | `purchase-order-lines.json`  | JSON achatado, uma linha por item                    |
| `delta/` | `orders.json`, `items.json`  | JSON em duas consultas, ligadas por `purchase_order` |

Não reformatar nem "corrigir" estes arquivos: eles valem como entrada externa, e a fidelidade ao formato do cliente é o que os torna úteis. Por isso estão em `.prettierignore`.

Casos que as amostras já contêm de propósito:

- **Beta:** CNPJ com máscara, data `dd/mm/aaaa`, decimal com vírgula e milhar com ponto (`1.200,000`), situação em português.
- **Gama:** dados de cabeçalho repetidos por linha, timestamp em segundos, centavos, situação numérica e unidade de compra em caixa — `TRP-09` tem preço unitário periódico (R$ 100,00 ÷ 3).
- **Delta:** `DL-2026-0046` é pedido **sem nenhum item**; `DL-2026-0099` é item **sem cabeçalho**. Os dois lados da falta de correspondência.

Faltam, e dependem de decisão em P1-01: amostra de nota fiscal para a conferência e variantes do Beta em Windows-1252/CRLF. Ver "O que o enunciado não fecha" em [docs/CASE.md](../../docs/CASE.md).
