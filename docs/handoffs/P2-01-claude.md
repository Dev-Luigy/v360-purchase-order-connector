# Handoff: P2-01 — Gama e Delta

- Agente e data: Claude, 2026-09-28.
- Estado: concluída.
- Objetivo e resultado: os dois clientes da Parte 2 entraram. **Os quatro clientes do enunciado estão integrados e validados**, com 27/27 exigências verificadas contra o serviço no ar.

## O que a Parte 2 provou sobre o desenho da Parte 1

O contrato normalizado **absorveu os dois clientes novos sem mudar uma coluna**. `purchase_order` e `purchase_order_item` não ganharam campo, não mudaram tipo e não precisaram de índice novo. Quatro formatos que discordam em estrutura, idioma, formato de data, formato de número, máscara de CNPJ, unidade e vocabulário de situação couberam no mesmo modelo.

As notações do Gama já eram exprimíveis no perfil: `dateFormat: 'unix-seconds'`, `money: 'cents'` e `conversionFactor` por item foram desenhados na Parte 1 antecipando exatamente isso, e os refinamentos do schema de perfil já tratavam `flat-json` e `split-json`. Nenhuma regra de conferência mudou.

**Só adicionar:** dois adaptadores de forma, dois perfis e a leitura de array na raiz do JSON.

**Exigiu mexer:** a rota tratava toda parte declarada como obrigatória, e o Delta pode entregar qualquer uma das duas consultas sozinha — a allowlist de partes aceitas passou a ser separada da lista de exigidas, que para `split-json` é vazia de propósito. O lote do adaptador passou a carregar o item já normalizado. E o caso de uso ganhou a orquestração da espera.

## A lacuna que eu encontrei e o usuário mandou fechar

O ADR-008 prometia que o item sem cabeçalho "espera em staging, para reconciliar quando o cabeçalho aparecer, sem pedir a carga de novo". **Não era o que acontecia**: não existia tabela, o órfão voltava no relatório da carga e se perdia. O cabeçalho podia chegar na carga seguinte e o item nunca reaparecia.

Consultado, o usuário escolheu persistir e reconciliar em vez de documentar a lacuna. Foi a **única migração que a Parte 2 exigiu** — e não para acomodar dado de cliente, mas para uma capacidade que faltava.

Escrever isso expôs um segundo problema, que o adaptador não tem como ver: ele só enxerga os cabeçalhos da carga **atual**, então um item de pedido que já existe no banco seria mandado para a espera em vez de atualizar o pedido. É o caso de mandar só a consulta de itens do Delta, que é uso normal, e teria silenciosamente parado de atualizar itens. Quem sabe disso é o caso de uso, que tem o repositório.

Decisões da implementação, registradas em [ADR-008](../decisions/ADR-008-ingestao.md): item gravado já normalizado com o cru ao lado; leitura revalida contra o contrato; ler e apagar na mesma transação, para que falha ao gravar o pedido deixe o item esperando em vez de sumir; e a carga da vez manda sobre a versão que esperava.

## Dois erros meus que só o Gama tornou visíveis

**Eu havia convertido a quantidade para unidade de consumo na entrada.** Estava errado e duplicaria a conversão: `consumptionBalanceOf` já multiplica o saldo pelo fator na conferência, e o tipo do domínio documenta que `quantityPending` é na unidade de compra. Com fator 1 em Alfa e Beta isso era invisível; o fator 12 do Gama expôs. A quantidade fica como o cliente mandou — 10 caixas continuam 10, e o detalhe mostra o mesmo número que o operador vê no sistema dele.

Cheguei a escrever a afirmação errada no README duas vezes, em versões diferentes, antes de ler o código que já decidia isso. Corrigido.

**Uma linha ruim do Gama gerava duas recusas**, a da linha e outra do grupo, contando o mesmo problema duas vezes no relatório de carga. Mesma classe do overflow do Beta fechado em FIX-09.

## Evidência

```
npm run check              208 testes, 0 falhas
npm run test:integration    16 testes contra PostgreSQL real, 0 falhas
scripts/validate-case.mjs   27/27 exigências do enunciado, no ar
```

Contra o stack real, os quatro clientes em um contrato só, e duas provas que só a Parte 2 permite:

```
conferência do Gama    saldo de 8 caixas de fator 12 aprova exatamente
                       96 unidades e recusa 97, informando esperado=96.000000
preço por caixa        R$ 100,00 ÷ fator 3 fecha exato na conferência,
                       porque a única divisão acontece no cálculo
reconciliação          carga só de itens deixa 4 em espera no banco;
                       a carga de cabeçalhos seguinte aceita 3 pedidos e
                       recupera os 3 itens; DL-2026-0099 continua esperando
```

## Limitações e pendências

- **A espera não tem expiração nem teto.** Um cliente que mande itens de pedidos que nunca existirão acumula linhas indefinidamente. A política — descarte por idade, teto por cliente, visibilidade operacional — não se decide sem dado de uso real, e está registrada como aberta no ADR-008.
- **O `split-json` carrega os cabeçalhos da carga em memória** para juntar os itens, como o `paired-csv` faz. A medição de volume de P1-05 mostrou esse custo plano até 50.000 pedidos, mas foi medida no Beta, não no Delta.
- **A reconciliação faz uma consulta por item órfão.** Órfão é exceção, então o custo é aceitável; uma carga com muitos órfãos seria lenta.
- Seguem sem tarefa, e foram adiados pelo usuário: pipeline de CI e política de exceção da auditoria npm.

## Estado deixado

- Posse: reservas de P2-01 liberadas.
- Compose no ar com os dados da validação. `docker compose down -v` limpa.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam alterações de CLEAN-01 do Codex. No `schema.prisma` eu preparei o commit para levar **apenas** o modelo novo, deixando o trabalho dele intacto no working tree. `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
