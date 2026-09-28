# Handoff: FIX-09 — retrato truncado e máscara do perfil

- Agente e data: Claude, 2026-09-28.
- Estado: concluída.
- Objetivo e resultado: fechar os quatro achados de [REVIEW-08](REVIEW-08-pos-fix-08-codex.md). Os dois primeiros foram reproduzidos por sonda antes da correção e procedem. **R08-01 é regressão que eu introduzi em FIX-08**, e o teste que escrevi para aquela correção não a pegou.

## R08-01 — eu tentei fechar um buraco e abri outro pior

O FIX-08 pôs teto de itens por pedido no adaptador do Beta: ao passar de `maxItemsPerOrder`, a linha excedente virava rejeição. O que eu não vi é que o grupo continuava com as 10.000 primeiras e era emitido como pedido normal. A sonda:

```
linhas na origem: 10001 | pedidos emitidos: 1 | itens no retrato: 10000 | rejeicoes: 1
```

Isso não é problema de memória, é corrupção semântica. `replaceSnapshot` **substitui**: o pedido entraria no banco com 10.000 itens, o 10.001º sumiria, e o retrato se diria completo. Pior que o problema original, porque o original falhava alto e este falha calado.

Agora o pedido inteiro é recusado, com **uma** rejeição — não uma por linha excedente — e o cabeçalho não reaparece no fim como pedido sem itens, o que apagaria os itens conhecidos do mesmo jeito.

**O teste que eu escrevi no FIX-08 comparava uma constante e nunca chamou o adaptador.** Ficou verde enquanto o defeito passava. É exatamente o tipo de teste que eu venho criticando nos outros lugares, e escrevi um.

## A mesma causa, num lugar que ninguém tinha olhado

Investigando o R08-01, o mesmo raciocínio se aplicava a um caso que já existia antes do FIX-08: quando **algumas** linhas de um pedido falhavam no parse, eu emitia o pedido com o subconjunto que deu certo. Isso também é retrato parcial, e `replaceSnapshot` apagaria do banco justamente os itens que não consegui ler.

A aceitação parcial de ADR-008 é **por pedido**, não por item dentro do pedido. Agora qualquer linha rejeitada faz o pedido sair com `items: null` — que existe exatamente para isso: aplica o cabeçalho e preserva os itens conhecidos.

## R08-02 — a promessa cumprida pela metade

`taxIdMasked: true` aceitava tanto a máscara quanto a forma limpa. Então a justificativa que escrevi no FIX-07 — "mudança de formato no ERP vira rejeição" — só valia num sentido.

Agora o campo é exclusivo nos dois lados, com matriz 2×2 de teste. E o parâmetro passou a ser **obrigatório**: padrão implícito é o que produz leniência por descuido, e essa foi a origem do problema.

## R08-03 e R08-04

- `maxCsvRecordSize` virou `maxCsvRecordCharacters`. O `csv-parse` mede o buffer **textual**, depois do `TextDecoder`, então o nome e o comentário diziam bytes e o código contava caracteres. Texto multibyte ocupa mais bytes que o número. Se um dia o requisito for bytes, precisa de contador na entrada, não desta opção.
- O comando da cobertura virou script versionado (`npm run coverage`). O número no `STATUS.md` era copiado à mão e divergia de quem media; agora o comando é o mesmo para todos, que é o que o CI vai usar como piso.

## Validação

`npm run check` verde: **138 testes**. Cobertura pelo script novo: **94,32% de linhas, 89,21% de branches**.

As regressões de R08-01 atravessam o adaptador com exatamente `maxItemsPerOrder` e `maxItemsPerOrder + 1`, e verificam três coisas separadas: nenhum pedido emitido, uma única rejeição, e o cabeçalho não voltando como pedido vazio.

## Continua pendente, sem mudança

R07-04, R07-05 e R07-09 seguem como critério obrigatório de P1-04, não como itens fechados: o agregado da conferência precisa ser montado pelo caso de uso a partir do pedido carregado, e o repositório ainda persiste a nota sem sanitizar. Auditoria npm, CI e integração com PostgreSQL continuam abertos e cada um merece tarefa própria.

O JSON aninhado ainda materializa um pedido inteiro antes do teto semântico; o `bodyLimit` de P1-04 limita a requisição, não o pedido.

## Pendências e próxima ação

- **ENV-03** segue sendo o caminho crítico.
- Posse: reservas de FIX-09 liberadas.
- Revisão: não realizada.
