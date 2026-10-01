# DOC-06 — as partes difíceis do projeto

- Responsável: Claude, 2026-10-01.
- Estado: concluída.
- Pedido do usuário: um arquivo citando como foi resolvido e arquitetado cada problema do projeto que merece explicação maior, resumido — observando que já existem arquivos com esse propósito, mas "muito vago".

## Por que os documentos existentes ficavam vagos

Fui ler antes de escrever, e a crítica está certa. O que existia:

- **`PROJECT-GUIDE.md` é navegacional.** Ensina onde fica cada coisa e descreve a pilha — "HTTP → caso de uso → porta ← adaptador". Isso é Clean Architecture genérica: o texto valeria, quase sem mudança, para qualquer serviço com essa separação. Não diz nada sobre **este** problema.
- **Os ADRs registram decisões isoladas.** Cada um tem contexto e consequência, mas ninguém lê catorze ADRs para formar um modelo mental, e eles não ligam uma decisão à outra.
- **Os handoffs têm a história toda**, por defeito, com a sonda que reproduziu cada um. São trinta e poucos arquivos: é arquivo morto, não leitura.

Faltava o meio: **qual era o problema difícil, por que a resposta óbvia falha, o que decidimos e como se sabe que funciona.** É o que o enunciado cobra quando diz "esteja pronto para defender".

## O que entrei

`docs/HARD-PARTS.md`, treze seções, sempre nos mesmos quatro movimentos: o problema, por que a resposta óbvia falha, a decisão, a prova.

|   # | Problema                                                           |
| --: | ------------------------------------------------------------------ |
|   1 | Quatro clientes que não concordam em nada                          |
|   2 | Dinheiro não sobrevive a ponto flutuante                           |
|   3 | A nota fala em unidades, o pedido fala em caixas                   |
|   4 | O item que chega antes do cabeçalho dele                           |
|   5 | O relatório da carga tem de dizer a verdade                        |
|   6 | Um documento truncado não pode deixar metade gravada               |
|   7 | Varrer dezenas de milhares de pedidos enquanto novas cargas entram |
|   8 | O mesmo número de pedido em clientes diferentes                    |
|   9 | Reenvio de um pedido que mudou                                     |
|  10 | Duas cargas do mesmo pedido ao mesmo tempo                         |
|  11 | Toda lista é paginada, e os limites são declarados                 |
|  12 | Os números do banco e os do contrato tinham de concordar           |
|  13 | A classe de defeito que mais apareceu                              |

A décima terceira é a que amarra as outras. O padrão que explica quase toda quebra séria deste projeto é **duas fontes de verdade que ninguém obriga a concordar** — contrato e banco, documentação e código, comentário e código, ADR e implementação, relatório e banco. E a contramedida que funcionou não é revisar com mais atenção: é tornar a divergência impossível ou vermelha.

O que **não** está lá, de propósito: contrato de rota (é o `API.md` e o `/docs` gerado), histórico de revisão por defeito (são os handoffs) e inventário de arquivos (é o `PROJECT-GUIDE.md`). O princípio editorial do `ENGINEERING.md` é não repetir inventário em vários lugares, e eu o respeitei.

## Tamanho

222 linhas, cerca de 3.200 palavras, uns quinze minutos de leitura. Treze problemas a aproximadamente quinze linhas cada. O pedido era "resumido" com "explicação maior", que são forças opostas; resolvi mantendo cada seção curta e cortando tudo que já mora em outro documento, em vez de cortar o número de problemas.

## Verificação

Toda afirmação específica do texto foi conferida contra o repositório, não escrita de memória:

- os onze nomes de teste citados existem — `grep -F` em `tests/` e `scripts/`;
- `defaultPageLimit = 50`, `maxPageLimit = 100`, `maxItemsPerOrder = 10_000`;
- 17 asserções em `tests/integration/staging.test.ts`; 250 pedidos em `recovery.test.ts`;
- quatro adaptadores para **cinco** perfis — a variante Windows-1252 do Beta é perfil, não código, e isso virou evidência da seção 1;
- o lock consultivo é `pg_advisory_xact_lock(hashtext(…))`; o `NUL` é recusado no contrato;
- os cinco links internos apontam para arquivos que existem.

`npm run check`: saída 0, 260 testes, 0 falhas.

O `ENGINEERING.md` passou a abrir por este documento, com a distinção explícita: ele responde _por quê_, o guia responde _onde fica_.
