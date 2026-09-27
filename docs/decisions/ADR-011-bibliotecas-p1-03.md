# ADR-011 — Bibliotecas de precisão, leitura em fluxo e validação

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Claude; tarefa P1-03.
- Autoridade: **escolha explícita do usuário**, em resposta às opções levantadas durante P1-03. A ADR-007 já tinha deixado a biblioteca decimal em aberto: "A escolha entre reusar decimal.js ou adotar outra biblioteca no domínio fica para P1-03."

## Contexto

P1-03 tinha quatro problemas que já têm solução pronta no ecossistema: aritmética decimal exata, leitura de JSON em fluxo preservando o texto do número, leitura de CSV com as tolerâncias de exportação brasileira, e validação. O `AGENTS.md` exige necessidade concreta documentada para dependência nova, e o Zod já estava no `package.json` usado só em `src/infrastructure/config/env.ts`.

## Decisão

**`decimal.js` 10.6 (MIT, zero dependências) como aritmética do domínio.** É a mesma biblioteca que o Prisma usa internamente, então a ponte com o repositório de P1-02 é `toString()` dos dois lados, sem conversão intermediária.

A biblioteca é permissiva de um jeito que dinheiro não tolera, e `src/domain/decimal.ts` existe para fechar quatro frestas, todas verificadas contra a 10.6 e cobertas por teste:

1. `new Decimal('0x10')` devolve 16, `'1_000'` devolve 1000, `'NaN'` e `'Infinity'` passam. Campo corrompido do cliente viraria número plausível em vez de rejeição, então o texto é validado contra a gramática do contrato antes de construir.
2. `toString()` emite notação exponencial (`1e-8`, `1e+21`), que não é o `DecimalText` do contrato. Só emitimos por `toFixed`.
3. Zeros à direita não sobrevivem (`'1200.000'` volta `'1200'`). Quantidade, fator e preço saem na escala 6 que a ADR-007 fixou, para que o mesmo valor tenha o mesmo texto venha ele como `1.200,000`, `1200` ou `120000` centavos.
4. **`plus`, `minus` e `times` arredondam para `precision` em silêncio** — o produto de dois números de trinta dígitos volta com a cauda zerada, sem aviso. Aqui essas três operações conferem se o resultado exato cabe nos 60 dígitos significativos configurados e **lançam** em vez de arredondar. A única operação que arredonda é `divide`, e só na escala que quem chama pediu. Foi o ponto que o usuário levantou: não perder nada, porque se trata de dinheiro.

**`stream-json` 3.7 (BSD-3, uma dependência) para o JSON em fluxo.** `streamArray({ numberAsString: true })` faz o montador guardar o número como a string do payload em vez de `parseFloat`: é o requisito da ADR-007 resolvido pela biblioteca. O filtro `pick` recorta o array do perfil, e chave ausente é distinguida de array vazio por uma sonda entre o filtro e o montador — sem ela, as duas situações seriam a mesma saída silenciosa, e perfil errado precisa falhar alto (ADR-008).

**`csv-parse` 7.0.3 (MIT, zero dependências) para o CSV.** Resolve aspas, quebra de linha dentro de campo, CRLF, BOM, linha em branco e numeração de linha por opção. O que ela não resolve é encoding fora da lista do Node — `encoding` aceita `BufferEncoding`, e Windows-1252 não está lá —, então decodificamos antes com `TextDecoder` e entregamos texto. Isso vale para qualquer alternativa: nenhuma biblioteca de CSV do ecossistema traz Windows-1252.

**Zod no perfil, no registro e na borda.** Schema do `ClientProfile` validado no start; schema do contrato normalizado conferindo a **saída** do adaptador antes de ela seguir para o repositório; e, em P1-04, nota fiscal e paginação na borda HTTP. O schema do contrato tem uma trava de deriva em tempo de compilação: se ele e o tipo se separarem, `src/domain/schemas.ts` para de compilar. Sem isso o schema viraria documentação desatualizada em vez de validação.

## Alternativas consideradas

`big.js` no lugar de decimal.js: menor, mas não é a que o Prisma usa, então a ponte com P1-02 não ganharia nada. Implementação própria com `bigint`: existiu, passava nos testes e foi descartada — código nosso para problema resolvido, e a exatidão que ela garantia é recuperável com guardas sobre a biblioteca. Manter os leitores próprios de JSON e CSV: mesma razão; casos de borda de CSV e de JSON em fluxo são um poço sem fundo, e cobrimos os que lembramos, não os que existem.

## Consumidores e pendências

P1-02 converte `Prisma.Decimal` para `DecimalText` por `toString()`. P1-04 usa `invoiceCheckRequestSchema` na borda e decide o código HTTP de cada classe de erro.

Pendências: o limite de 60 dígitos significativos é folgado para dado de ERP — o maior caso real aqui tem nove — mas é uma constante escolhida, não medida. A tolerância monetária configurável continua não implementada (ADR-007).
