# ADR-007 — Decimal, dinheiro e unidade de compra

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Claude; tarefa P1-01.
- Autoridade: decisão de engenharia da tarefa; o `AGENTS.md` já proíbe ponto flutuante para cálculo monetário.

## Contexto

Quantidade e preço chegam em quatro notações: `45.9` como número JSON no Alfa e no Delta, `1.200,000` e `6,49` em texto brasileiro no Beta, `120000` centavos no Gama. Quantidade **não** é inteira — o Beta manda três decimais e unidade `KG`. E a conversão de caixa para unidade no Gama produz dízima: `TRP-09` são 10000 centavos por caixa de fator 3, ou seja 3333,333... centavos por unidade.

## Decisão

**Nada de ponto flutuante, em lugar nenhum do caminho.** O contrato transporta decimal como texto (`DecimalText` em `src/domain/primitives.ts`) e o PostgreSQL usa `NUMERIC` com escala explícita — sem `@db.Decimal`, o Prisma escolheria `Decimal(65,30)`. Quantidades, fator e preço com escala 6; valores monetários comparados na escala da moeda.

**Preço é sempre por unidade de compra, e o fator vem do payload.** Não persistimos preço por unidade de consumo, porque ele é dízima no Gama e arredondá-lo na gravação quebraria a Parte 2 e forçaria migração — exatamente o que o enunciado pede para relatar. O `fator_conv` do Gama vem **em cada item** e varia entre itens do mesmo pedido (12 num, 3 no outro), então conversão de unidade não é configuração de cliente: é dado da linha.

**A unidade canônica de conferência é a unidade de consumo**, porque as notas fiscais sempre informam quantidade em unidades, nunca em caixas. O valor esperado de uma linha é calculado como `quantidade_em_unidades ÷ fator × preço_por_unidade_de_compra`, arredondado ao final para a escala da moeda com **meio para cima**, e comparado exatamente. Arredondar só no fim evita propagar a dízima; meio para cima acompanha a prática de nota fiscal brasileira, enquanto arredondamento bancário divergiria do cálculo do fornecedor.

**Tolerância zero depois do arredondamento.** Diferença de centavo é divergência, e `VALOR_TOTAL_DIVERGENTE` informa esperado e recebido para o usuário julgar. Uma faixa de tolerância é ajuste de negócio plausível, mas esconde erro sistemático e não foi pedida; fica como ponto de configuração futuro, não implementado.

**Decimal a partir de JSON.** `JSON.parse` já converteu `45.9` em `double` antes de qualquer decisão nossa. O adaptador de JSON usa parser em fluxo que expõe o texto original do número — precisamos de fluxo de qualquer forma, pelo requisito de volume, então o custo é o mesmo. `String(double)` devolve a menor representação que faz round-trip e recupera o decimal original para valores com até 15 dígitos significativos; isso é suficiente para dado de ERP, mas é uma garantia com limite, e preferimos não depender dela.

## Alternativas consideradas

Inteiro em centavos para tudo: descartada, quantidade tem escala própria (`KG` com três decimais) e o fator de conversão introduz divisões que centavos não representam. `number` com arredondamento no final: descartada, é o erro que o `AGENTS.md` proíbe. Persistir preço por unidade já convertido: descartada pela dízima.

## Consumidores e pendências

P1-02 define precisão e escala das colunas; P1-03 implementa os conversores por notação e o objeto de valor decimal do domínio. `Prisma.Decimal` (decimal.js) fica confinado à infraestrutura: o domínio não importa Prisma, conforme `AGENTS.md`. A escolha entre reusar decimal.js ou adotar outra biblioteca no domínio fica para P1-03.

Pendência: escala definitiva de cada coluna, a validar com dados de carga em P1-02.
