# AUDIT-01 — fidelidade entre a entrada e o banco

- Responsável: Claude, 2026-09-30.
- Estado: concluída.
- Pergunta do usuário: os dados inseridos no banco estão de acordo com as entradas? Pegar os exemplos do enunciado, fazer a entrada e analisar a igualdade.
- Escopo: as quatro amostras de `docs/CASE.md`, carregadas pelas rotas reais e comparadas campo a campo contra o PostgreSQL. Nenhum código de produção foi alterado.

## Método, e por que ele não é circular

O risco óbvio desta auditoria é comparar a aplicação com ela mesma. `scripts/audit-fidelity.mjs` evita isso de duas formas:

- **o esperado é derivado à mão do arquivo cru**, aplicando as regras escritas em `docs/CASE.md` — máscara de CNPJ, `dd/mm/aaaa`, decimal brasileiro, timestamp Unix, centavos, vocabulário de situação. O script **não importa nada de `src/`**. Se o adaptador e o script chegam ao mesmo valor, chegaram por caminhos independentes;
- **o lido vem do PostgreSQL por `psql`**, não pela API, para que a serialização da resposta não possa mascarar o que está gravado.

O preço unitário merece nota. `unit_price` do Alfa e do Delta é número JSON (`45.9`, `8.2`), e `JSON.parse` produz ponto flutuante. O script pega o **texto** do número direto do arquivo, por expressão regular, em vez de deixar `JSON.parse` tocar nele. Assim o esperado é `45.900000` por construção, não por acidente de arredondamento coincidir.

## Resultado

```text
156 comparações de campo em 8 pedidos e 11 itens
  todos os campos batem com o arquivo de entrada
```

Cobre, por pedido: CNPJ, razão social, moeda, situação, data de emissão, saldo pendente e contagem de itens. Por item: material, descrição, unidade, fator de conversão, quantidade pedida, recebida e pendente, preço unitário e data própria da linha. Inclui texto acentuado atravessando o caminho CSV — `Metalúrgica São Jorge S.A.`, `Óleo de soja 900ml`, `Açúcar refinado 1kg`, `Frigorífico Boa Mesa S.A.`, `Armazéns Rio Claro Ltda` — comparado por igualdade exata de string.

Também afirma que `DL-2026-0099`, o item Delta sem cabeçalho, **não** virou pedido inventado.

## Duas perguntas que a comparação levantou

### O Gama perde a data por linha?

No Gama, `dt_criacao` vira a data do pedido e o perfil declara `lineCreatedOn: null`. A primeira leitura disso é perda de informação: e se duas linhas do mesmo pedido trouxerem `dt_criacao` diferente, porque um item foi incluído depois?

Sondado contra a aplicação real, com duas linhas do mesmo pedido em datas diferentes:

```text
HTTP 200
aceitos: 0  itens: 0  recusados: 1
  recusa: AUD-GAMA-1 -> linhas do mesmo pedido discordam nos dados do
          cabeçalho; o pedido inteiro foi recusado para não gravar um dos dois
```

**Não perde.** No formato achatado é o cabeçalho que se repete, e divergência entre as repetições é recusa explícita, não "vence o primeiro". Uma data de linha diferente nunca pode ser descartada em silêncio, porque ela impede o pedido inteiro de entrar. `lineCreatedOn` por item existe no Delta, onde o enunciado define essa semântica de propósito.

### A nota fiscal gravada é a que foi enviada?

A conferência guarda a nota inteira numa coluna `jsonb`, e nenhuma verificação anterior comparou o gravado com o enviado. Conferido nos dois sentidos:

- **nada se perde**: os quatro campos da nota e os três de cada linha voltam idênticos do `jsonb`, com os valores como texto (`"40"`, `"1836.00"`). A ordem das chaves muda, porque `jsonb` normaliza — é comportamento documentado do PostgreSQL, não perda;
- **nada entra a mais**: enviando `campoIntruso` na nota e `extraNaLinha` na linha, a resposta é `201` e o `jsonb` guarda apenas `clientId`, `lines`, `purchaseOrderNumber`, `supplierTaxId` e, na linha, `material`, `quantity`, `totalValue`. O registro é o que o schema devolve, não o que o chamador mandou.

## Relação com REVIEW-19

O Codex fez uma verificação de mesmo objetivo em REVIEW-19, no mesmo dia, e chegou à mesma conclusão. As duas foram feitas sem conhecimento uma da outra; eu só li o handoff dele depois de rodar a minha. Onde esta acrescenta: o esperado derivado sem tocar em `src/`, o preço lido como texto para escapar do ponto flutuante, a sonda de data divergente no Gama e a auditoria da nota em `jsonb` nos dois sentidos.

## Persistência, de quebra

Os contêineres pararam sozinhos por cerca de treze horas entre duas execuções desta auditoria, com saída limpa. Ao voltar, o banco tinha 28 pedidos, 20.035 itens, 6 conferências, 5 divergências e as 7 migrações. É a exigência não opcional 1 do enunciado provada por uma parada real, não simulada.

## Como repetir

```sh
docker compose up -d
npm run audit:fidelity
```

Sai `0` quando tudo bate e `1` na primeira divergência, com arquivo e banco lado a lado.
