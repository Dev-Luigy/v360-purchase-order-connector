# As partes difíceis

Este documento existe para uma pergunta: **por que o código tem essa forma, e não outra?**

O [guia do projeto](PROJECT-GUIDE.md) ensina onde fica cada coisa. Os [ADRs](decisions/README.md) registram decisões uma a uma. Nenhum dos dois conta qual era o problema difícil, por que a solução óbvia falha e como se sabe que a escolhida funciona. É isso aqui.

Cada seção tem quatro movimentos: **o problema**, **por que a resposta óbvia falha**, **a decisão**, **a prova**. Treze seções, lidas em cerca de quinze minutos.

---

## 1. Quatro clientes que não concordam em nada

**O problema.** Alfa manda JSON com itens aninhados. Beta manda dois CSV em português, com CNPJ mascarado, data `dd/mm/aaaa` e decimal com vírgula. Gama manda tudo achatado, com data em timestamp Unix, preço em centavos e situação como código numérico. Delta manda dois JSON independentes que podem não retratar o mesmo instante. Eles discordam em estrutura, idioma, formato de data, formato de número, máscara de documento e vocabulário de situação.

**Por que a resposta óbvia falha.** A resposta óbvia é um módulo por cliente. Aí cada contrato novo é alteração de produto, e a mudança no ERP de um cliente entra no caminho de código de todos. O enunciado diz isso com outras palavras: a plataforma não pode conhecer o formato de cada cliente.

**A decisão.** O eixo de variação é a **forma de entrega**, não o cliente. Existem quatro adaptadores — `nested-json`, `paired-csv`, `flat-json`, `split-json` — e um **perfil** por cliente que declara, em dados, qual forma ele usa, como escreve datas e números, se mascara o documento, qual o vocabulário de situação dele e qual campo do arquivo corresponde a qual campo do contrato.

Cliente novo numa forma já conhecida entra **só com perfil**. Nada de código novo.

**A prova.** Quatro adaptadores atendem **cinco** perfis: a variante do Beta que exporta em Windows-1252 com CRLF — o que um ERP brasileiro de verdade costuma produzir — é outro perfil, não outro caminho de código. E um teste carrega um cliente inexistente num perfil novo, afirmando que ele atravessa a aplicação inteira sem uma linha adicional: `tests/p2-01-gama-delta.test.ts`, "cliente novo em forma conhecida entra só com perfil". Gama e Delta entraram na Parte 2 **sem mudar uma coluna** do banco.

---

## 2. Dinheiro não sobrevive a ponto flutuante

**O problema.** `unit_price` do Alfa e do Delta é número JSON: `45.9`, `8.2`. `JSON.parse` devolve ponto flutuante. E o próprio enunciado traz um caso que não fecha: `TRP-09` do Gama são R$ 100,00 a caixa de 3 unidades, ou seja R$ 33,3333… por unidade. Não existe preço unitário exato para guardar.

**Por que a resposta óbvia falha.** Guardar em `float` erra centavos em escala. Guardar em centavos inteiros resolve dinheiro e não resolve quantidade fracionária nem fator de conversão. E arredondar na entrada esconde o erro: o contrato aceitava doze casas decimais, a coluna guardava seis, e a conversão para texto fazia `0.0000001` virar `0.000000` — o valor sumia sem ninguém ser avisado.

**A decisão.** Três partes.

1. **Decimal viaja como texto**, do arquivo ao JSON de resposta: `"45.900000"`, nunca `45.9`. Em nenhum ponto o valor passa por `float`.
2. **Duas escalas, de propósito.** Doze casas para **cálculo** (a conversão de caixa para unidade produz mais casas no meio do caminho) e seis para o que é **persistido** (`NUMERIC(30,6)`). Separar as duas é o que torna o arredondamento silencioso impossível: valor com mais casas do que a coluna guarda é **rejeitado**, não arredondado.
3. **O preço periódico não é resolvido na ingestão.** Guardamos o preço por unidade de compra e o fator; a divisão acontece na conferência, com escala e arredondamento declarados, onde há uma comparação a fazer.

**A prova.** `tests/decimal.test.ts` e `tests/review-01-regressoes.test.ts` cobrem as bordas por valor: 24 dígitos inteiros, 13 casas recusadas, `'0x10'` que não pode virar 16, notação exponencial que não vaza para o contrato. O caso do enunciado tem asserção própria: "preço por caixa não vira dízima: R$ 100,00 ÷ 3 fecha exato". E `npm run audit:fidelity` compara 156 campos entre o arquivo de entrada e o PostgreSQL, derivando o esperado **sem importar nada de `src/`** e lendo o preço como texto, por expressão regular, para `JSON.parse` não tocar nele.

---

## 3. A nota fala em unidades, o pedido fala em caixas

**O problema.** O pedido pode estar em unidade de compra — caixa, `CX` — com um fator de conversão. As notas dos fornecedores informam quantidade **sempre em unidades**. Comparar os dois números crus reprova nota correta.

**Por que a resposta óbvia falha.** Converter na ingestão, guardando tudo em unidade de consumo, perde o dado original: deixa de ser possível responder "quantas caixas foram pedidas", e um fator corrigido depois não tem como ser reaplicado.

**A decisão.** O pedido é persistido **como o cliente o emitiu** — quantidade e preço na unidade de compra, com o fator ao lado. A conversão acontece na conferência. O detalhe do pedido entrega as duas leituras: o saldo na unidade de compra e o saldo já convertido para unidade de consumo, que é a unidade em que a nota vem.

**A prova.** `tests/conference-rules.test.ts` e, pela rota real, "quantidade em caixa é convertida a unidade na conferência" em `scripts/validate-case.mjs`.

---

## 4. O item que chega antes do cabeçalho dele

Esta é a parte mais difícil do projeto. Dez ciclos de revisão passaram por aqui.

**O problema.** Delta entrega duas consultas independentes, e o enunciado avisa que elas **não têm garantia de retratar o mesmo instante**: a consulta de itens pode conhecer um pedido que a de cabeçalhos ainda não conhece. O que o serviço faz com um item cujo pedido não existe?

**Por que a resposta óbvia falha.** Três respostas óbvias, três problemas.

- **Rejeitar** o item descarta dado válido que só chegou fora de ordem.
- **Criar um pedido** a partir do item inventa cabeçalho: fornecedor, situação e data que ninguém afirmou. Um pedido sem situação nunca poderia ser conferido.
- **Guardar em memória** até o cabeçalho chegar não funciona: o cabeçalho pode vir em **outra requisição**, horas depois.

**A decisão.** Uma tabela de espera com **ciclo de vida**, e é o ciclo de vida que resolve, não a tabela.

A linha nasce **não publicada** — invisível para qualquer outra carga. Ela só se torna visível na **mesma transação** em que a carga que a trouxe a contabiliza no relatório. Quando o cabeçalho chega, os itens que esperavam por ele entram no retrato dentro da transação que grava o pedido.

Três invariantes sustentam isso, e cada um fechou um defeito real:

| Invariante                                                            | O que ele impede                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A linha nasce invisível e é publicada no mesmo fechamento que a conta | Um cabeçalho concorrente consumir o prefixo de uma carga que depois recusaria o pedido inteiro   |
| A identidade física da espera inclui o identificador da carga         | Duas cargas simultâneas do mesmo pedido consumirem uma a espera da outra                         |
| **Carga terminada não deixa linha não publicada**                     | Um fechamento que falha deixar linha invisível no banco enquanto o relatório diz `stagedTotal=0` |

O terceiro é o que encerrou a sequência de defeitos. Note a forma dele: não é "verifique se sobrou linha", é "é impossível sobrar" — a carga termina descartando o não publicado e, se sobrou algo, o relatório **diz**.

**A prova.** `tests/integration/staging.test.ts`, 17 asserções contra PostgreSQL real, incluindo duas aplicações concorrentes no mesmo pedido. E `tests/integration/recovery.test.ts` gera 250 pedidos com semente fixa, mata a API com `SIGKILL` no meio da espera não publicada, reinicia o processo e compara 1.532 itens direto no banco.

---

## 5. O relatório da carga tem de dizer a verdade

**O problema.** A carga é longa e aceita parcialmente: um registro inválido não derruba o resto. Então a resposta precisa dizer quantos pedidos entraram, quantos itens, o que foi recusado e por quê, e o que ficou esperando. Cada um desses números já esteve errado.

**Por que a resposta óbvia falha.** Três armadilhas, todas vividas.

- **Contar por aritmética.** `entradas − aplicados` fabrica espera que não existe, porque uma linha reenviada dentro da mesma carga substitui a anterior em vez de somar. Contagens de granularidades diferentes não se subtraem.
- **Recontar depois.** Soltar os locks e então contar deixa outra requisição consumir uma linha no intervalo — ela desaparece do relatório da carga que a recebeu.
- **Somar o que está no pedido.** `order.items.length` inclui os itens preservados de cargas anteriores: uma carga só de cabeçalhos relataria itens que não trouxe.

**A decisão.** Todo número do relatório sai do **estado**, e a contagem e a amostra vêm do **mesmo fechamento** que publicou as linhas, sob o mesmo lock. As origens ficam separadas no tipo de retorno — o que veio nesta carga, o que foi recuperado da espera, o que ficou esperando — para quem chama não poder confundi-las.

As listas são **amostra**, com teto de 100, e os totais vêm em campos separados. Uma carga com dez mil recusas não pode virar uma resposta JSON sem teto, e nada fica escondido porque o total vai do lado.

**A prova.** `npm run validate:http`, 17 cenários por `fetch` contra a porta 3000 — sem `app.inject` —, incluindo "o relatório da carga conta o que ela mesma recebeu" e "fechamento que falha não deixa item fora do relatório".

---

## 6. Um documento truncado não pode deixar metade gravada

**O problema.** A carga é lida em fluxo, para não reter dezenas de milhares de registros em memória. Se o arquivo termina no meio — transporte cortado, exportação incompleta — o leitor só descobre depois de já ter gravado o prefixo.

**Por que a resposta óbvia falha.** Responder `422 payload incompatível` e deixar os pedidos gravados é o pior dos dois mundos: a resposta nega a carga e o banco tem dados novos, sem recibo nenhum de o que entrou. Medido: 200 pedidos persistidos com resposta de erro. A alternativa — uma transação única para a carga inteira — joga fora o streaming e segura uma transação por minutos.

**A decisão.** Uma **passagem estrutural antes de qualquer escrita**. Ela percorre o documento inteiro só para saber se ele termina, consumindo os tokens do parser e descartando-os, sem materializar valor nenhum. Se o documento não fecha, a resposta é `422` e **nada** foi escrito.

Isso só é defensável porque foi medido: **0,6 s contra 83 s**, cerca de 1% do custo da carga, com 20.000 pedidos. Preservar o streaming e a atomicidade do recibo custa 1%.

**A prova.** "documento truncado não grava pedido nenhum" e "payload malformado responde 422 e não deixa resíduo", em `npm run validate:http`.

---

## 7. Varrer dezenas de milhares de pedidos enquanto novas cargas entram

**O problema.** O enunciado descreve exatamente este cenário: a plataforma varre o conjunto em lote, de madrugada, **enquanto novas cargas continuam entrando**. A varredura precisa terminar, não repetir e não pular.

**Por que a resposta óbvia falha.** `OFFSET` fica mais caro a cada página e, pior, **pula e repete** quando o conjunto muda no meio: uma inserção antes da posição atual desloca tudo. E um cursor apenas com limite inferior (`id > último`) persegue o que entra — sob escrita contínua ele não tem condição própria de término.

**A decisão.** Duas peças que só funcionam juntas.

1. **Identificador monotônico.** UUID v7, ordenável no tempo. Uma linha inserida durante a varredura recebe um id maior que a posição atual e vai para o fim, em vez de cair antes dela e nunca ser vista.
2. **Cursor que carrega o teto.** O maior id do recorte é fixado na **primeira** página e viaja dentro do cursor. A varredura é um **retrato**: o que entrar depois fica para a próxima. O cursor carrega também uma impressão dos filtros, então trocar um filtro no meio é recusado — em vez de devolver em silêncio uma página de outro conjunto.

**A prova.** `npm run validate:sweep` varre 20.000 pedidos com um escritor concorrente **ainda ativo depois do fim da varredura**, afirmando zero repetidos. A última faixa de páginas custa cerca de metade da primeira, o que distingue cursor de `OFFSET` por medição e não por argumento. E `tests/contrato-documentado.test.ts` falha se algum `uuid(7)` do schema virar `uuid(4)` — trocar isso quebraria a varredura em silêncio, sem nenhum teste ficar vermelho.

---

## 8. O mesmo número de pedido em clientes diferentes

**O problema.** O enunciado cobra isso explicitamente. `4500001234` do Alfa e `4500001234` do Beta são pedidos distintos.

**A decisão.** A identidade externa é o par `(clientId, externalNumber)`, com unicidade no banco. O identificador interno é nosso, e o cliente **vem do caminho da requisição**, nunca deduzido do conteúdo — Delta usa os mesmos nomes de campo do Alfa, então o conteúdo não identifica a origem.

A conferência encontra o pedido por cliente e número, não pelo nosso id: a plataforma conhece o número do pedido, não a nossa identidade interna.

**A prova.** "o mesmo número de pedido existe em clientes diferentes", em `scripts/validate-case.mjs`.

---

## 9. Reenvio de um pedido que mudou

**O problema.** O enunciado pede a política registrada: o cliente reenvia um pedido cuja quantidade recebida aumentou. O que acontece?

**Por que a resposta óbvia falha.** Acumular versões transforma a consulta em "qual é a verdade agora?". Apagar e recriar perde a identidade interna, e o histórico de conferências passa a apontar para um pedido que não existe mais.

**A decisão.** O retrato é **substituído** numa transação, preservando a identidade interna, incrementando uma versão de ingestão e recalculando o saldo. Cada conferência guarda a versão do pedido que ela conferiu, para uma recarga posterior não mudar o sentido de uma conferência antiga.

E uma distinção que parece detalhe e não é: `items: null` significa "esta carga não trouxe os itens" e **preserva** os já conhecidos; `items: []` significa "o cliente afirma que não há itens" e **remove**. São coisas diferentes, e confundi-las já causou perda de dado — uma carga só de cabeçalhos substituiu o retrato e apagou itens que outra consulta havia trazido.

**A prova.** "reenvio de pedido que mudou atualiza no lugar e recalcula o saldo" e "mandar só cabeçalhos NÃO apaga os itens já conhecidos", em `scripts/validate-case.mjs`.

---

## 10. Duas cargas do mesmo pedido ao mesmo tempo

**O problema.** Nada impede duas requisições simultâneas carregarem o mesmo pedido. Sem serialização, uma sobrescreve a outra ou as duas gravam metade.

**Por que a resposta óbvia falha.** `SELECT … FOR UPDATE` tranca uma linha que existe. O caso difícil é justamente o pedido que **ainda não existe**: não há linha para trancar, e as duas transações decidem criar.

**A decisão.** Lock consultivo de transação por `(clientId, externalNumber)` — `pg_advisory_xact_lock(hashtext(…))`. Ele tranca um **nome**, não uma linha, então funciona antes de o pedido existir, e é liberado pelo fim da transação, sem risco de ficar pendurado.

**A prova.** "duas aplicações concorrentes no mesmo pedido não perdem uma delas", em `tests/integration/staging.test.ts`, contra PostgreSQL real.

---

## 11. Toda lista é paginada, e os limites são declarados

**O problema.** Exigência não opcional do enunciado: toda interface que devolve lista é paginada, com tamanho padrão e teto declarados, e a paginação conviver com os filtros é o uso normal.

**A decisão.** Padrão 50, teto 100. `limit` acima do teto é **recusado com 400**, não recortado em silêncio — o enunciado pede o teto justamente para ninguém descobrir em produção o que acontece ao pedir um milhão de registros. A resposta diz onde está, se há mais e como pedir o próximo pedaço.

Os filtros do requisito 1 são `clientId`, `supplierTaxId`, `status` e `pending=true`, mais um que não foi pedido e é uso legítimo: `externalNumber`, porque a plataforma conhece o número do pedido e procurar onde ele está é razoável.

**A prova.** Quatro asserções de paginação em `scripts/validate-case.mjs`, incluindo "trocar o filtro no meio da varredura é recusado, não silenciado".

---

## 12. Os números do banco e os do contrato tinham de concordar

**O problema.** O schema Zod validava conteúdo e o schema do banco declarava `VARCHAR(n)`, sem nenhuma relação entre os dois. O resultado é um registro que passa pelo contrato e morre na gravação — e a borda HTTP traduz isso em `500`, no lugar de uma rejeição determinística na carga.

**A decisão.** `src/domain/limits.ts` é a fonte única. O Zod aplica as constantes, o schema do banco declara exatamente os mesmos números, e um teste compara os dois lados. Além disso: o PostgreSQL não representa `NUL` em `text`, `varchar` nem `jsonb`, e `z.string()` aceita — então o contrato recusa `NUL` explicitamente, e só ele, sem remover nem truncar nada em silêncio.

**A prova.** `npm run check` executa `schema:check` e o teste de limites; `tests/contrato-documentado.test.ts` compara os números documentados com os aplicados.

---

## 13. A classe de defeito que mais apareceu

Vale nomear, porque explica a forma de várias soluções acima.

**Duas fontes de verdade que ninguém obriga a concordar.** Toda vez que este projeto quebrou de forma não trivial, foi isso:

| Onde                  | O que divergiu                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contrato e banco      | Zod validava 129 caracteres, a coluna aceitava 128                                                                                                       |
| Documentação e código | o cabeçalho da ingestão, **todos** os nomes de parte, os limites de página, e o contrato de erro — forma aninhada documentada contra resposta plana real |
| Comentário e código   | um comentário afirmava transação única onde havia duas                                                                                                   |
| ADR e implementação   | o pool de ingestão existia e **nada o usava**; o teto de transação do Prisma ficou no padrão de 5 s enquanto o ADR prometia transação longa              |
| Relatório e banco     | `stagedTotal=0` com linha invisível gravada                                                                                                              |

A contramedida não é revisar com mais atenção. É **fazer a divergência impossível ou vermelha**:

- constantes compartilhadas, com teste comparando os dois lados;
- testes que **leem o código-fonte** e falham quando a documentação discorda — foi assim que as quatro derivas de documentação foram pegas;
- o documento OpenAPI de `/docs` é **gerado** dos mesmos schemas que validam a requisição, então não tem como divergir;
- números de evidência **gerados** por `npm run evidence`, não digitados: escritos à mão eles derivaram três vezes;
- invariantes enunciados como impossibilidade — "carga terminada não deixa linha não publicada" — em vez de verificações que alguém precisa lembrar de fazer.

E uma lição de método, aprendida errando: **executar cada comando à mão não é equivalente a rodar o pipeline**. Os quatro jobs do CI foram exercitados localmente com resultado esperado; na primeira execução real, um falhou — `test:integration` exigia um `.env` que é gitignored, e num checkout limpo o Node aborta antes de rodar teste nenhum. A diferença que pegou foi o checkout limpo, que a máquina de quem desenvolve nunca é.

---

## Para onde ir depois

- O contrato das rotas: [API.md](API.md), ou `/docs` com o serviço no ar.
- Onde fica cada coisa: [PROJECT-GUIDE.md](PROJECT-GUIDE.md).
- Cada decisão com seu contexto completo: [ADRs](decisions/README.md).
- O que foi medido, e o que ainda não: [STATUS.md](STATUS.md).
- A história de cada defeito, com a sonda que o reproduziu: [handoffs](handoffs/).
