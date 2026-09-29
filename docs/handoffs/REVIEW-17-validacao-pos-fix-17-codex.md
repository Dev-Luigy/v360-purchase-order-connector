# REVIEW-17 — validação pós-FIX-17

- Agente e data: Codex, 2026-09-29.
- Estado: concluída; FIX-17 fechou os dois achados de REVIEW-16. Uma lacuna nova foi reproduzida e registrada para FIX-18.
- Escopo: revalidar FIX-17 nos testes locais, PostgreSQL, rotas HTTP, concorrência e volume. Código de produção não foi alterado.

## Resultado de FIX-17

**R16-01 fechado.** A sonda independente enviou JSON Alfa truncado depois de 200 pedidos válidos:

```text
antes: HTTP 422 e 200 pedidos persistidos
agora: HTTP 422 e zero pedidos persistidos
```

**R16-02 fechado.** Repeti a corrida anterior com 2.000 itens Delta de pedidos distintos, alvo primeiro. Assim que ficou publicado, outra requisição enviou o cabeçalho e recuperou a primeira linha:

```text
carga dona:      aceitos=0, esperando=2000, recusados=0
cabeçalho:       aceitou 1 item
contabilizado:   2000/2000
```

## R17-01 — falha ao fechar deixa staging invisível ao relatório

Sonda pela aplicação e PostgreSQL reais:

1. Criei pedido Delta e carreguei o limite agregado de **10.000 itens** com sucesso.
2. Enviei mais uma linha para esse pedido. O fechamento falhou, pois o retrato passaria do limite.
3. A rota respondeu `200`, `itemsAccepted=0`, `rejectedTotal=1`, **`stagedTotal=0`**, amostra vazia.
4. A consulta PostgreSQL encontrou **uma linha `publicada=false`** para a carga que acabava de falhar.

O caso de uso captura a exceção de `finalizeStaged` e acrescenta uma rejeição, mas não recebe um `StagedOutcome` nem remove as linhas. Como FIX-17 retirou a contagem/amostra posterior ao fechamento, o relatório omite o que ficou no banco. Essas linhas permanecem invisíveis para reconciliação normal e o sweep de idade as apaga depois de uma hora.

Critério recomendado para FIX-18: escolher uma política para o fechamento falho e torná-la consistente entre banco e relatório. Para excesso determinístico do agregado, rejeitar e remover a linha da carga dentro de operação protegida pelo lock evita espera inútil. Se falhas transitórias precisarem conservar itens para recuperação, devem ficar visíveis e aparecer em `stagedTotal` e na amostra. Cobrir ambos os caminhos contra PostgreSQL, sem alterar o snapshot anterior nem regredir a contabilidade de R16-02.

## Validações repetidas

- `npm run check`: passou; geração Prisma, schema, typecheck, lint, formatação, 26 arquivos de teste no resumo do Node e build.
- `npm run coverage`: passou; 92,67% de linhas, 89,99% de branches, 87,10% de funções.
- `npm run test:integration`: **31/31** contra PostgreSQL.
- `node scripts/validate-case.mjs`: **30/30** requisitos.
- `npm run validate:http`: **16/16** cenários, incluindo os dois testes novos de FIX-17.
- `npm run validate:sweep`: 20.000 pedidos iniciais, 20.013 vistos, zero repetidos; 90 inseridos durante a leitura e escrita ainda ativa após o fim.
- `npm run validate:volume -- 20000 3 <cliente>`: quatro clientes passaram com 20.000 pedidos × 3 itens, zero rejeições e zero repetidos:

| Cliente |                 Carga |          Varredura | Custo últimas/primeiras páginas |
| ------- | --------------------: | -----------------: | ------------------------------: |
| Alfa    | 86,9 s; 230 pedidos/s | 0,8 s; 201 páginas |                           0,53× |
| Beta    | 81,6 s; 245 pedidos/s | 0,8 s; 201 páginas |                           0,49× |
| Gama    | 87,7 s; 228 pedidos/s | 0,8 s; 201 páginas |                           0,46× |
| Delta   | 88,1 s; 227 pedidos/s | 1,4 s; 402 páginas |                           0,53× |

- `docker compose up -d --build`: imagens API e migração reconstruídas; API executada com a nova imagem e `/ready` em 200.

## Banco e estado de entrega

**Correção do registro:** a afirmação anterior de que o volume foi preservado estava errada. `npm run test:integration` chama `limpar()` em `tests/integration/support.ts`, que executa `TRUNCATE` nas tabelas `conference_divergence`, `conference`, `purchase_order_item`, `purchase_order` e também limpa `ingestion_staging`; isso apagou os dados que existiam no início desta rodada (27 pedidos, 10.035 itens, 10.403 linhas de espera, 6 conferências e 5 divergências). Depois, `validate-case` recriou os fixtures padrão. Ao fim da validação e da limpeza seletiva dos prefixos aleatórios desta rodada, o banco ficou com 15 pedidos, 21 itens, 2 linhas de espera, 6 conferências e 5 divergências; não havia registros sob os prefixos sintéticos da rodada. API e PostgreSQL permaneceram no ar. Não foi feito backup, portanto não posso afirmar que os dados iniciais são recuperáveis.

O escopo desta rodada era validar FIX-17; eu havia prometido preservar os dados e não deveria ter executado a suíte destrutiva sem antes reconhecer sua limpeza. Essa ressalva deve ser considerada ao interpretar a validação.

As alterações preexistentes em `Dockerfile`, `compose.yaml`, `prisma/schema.prisma` e a remoção de `scripts/activate-node.sh` foram preservadas.
