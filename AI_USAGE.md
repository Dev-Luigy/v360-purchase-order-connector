# Como usei IA neste desafio

> Rascunho montado a partir do registro do próprio repositório — handoffs, quadro de tarefas e histórico de commits. Revise e ajuste antes de enviar: o relato é seu.

## As ferramentas, e onde cada uma entrou

Usei **duas** assistentes, de propósito, com papéis separados:

- **Claude Code (Opus)** — implementação. Domínio, adaptadores, repositórios, rotas, testes, migrações e a maior parte da documentação.
- **Codex** — revisão independente e validação. Rodar o serviço de verdade, procurar defeito, e escrever o laudo.

A separação é o ponto. Pedir para a mesma assistente que escreveu o código revisá-lo produz concordância, não revisão. Quando a revisora é outra sessão, sem acesso à conversa em que o código nasceu, ela precisa reconstruir o entendimento a partir do que está no repositório — e é aí que a lacuna aparece.

O que isso gerou, em números do repositório:

|                                                |                                |
| ---------------------------------------------- | ------------------------------ |
| Commits                                        | 158                            |
| Handoffs escritos                              | 69                             |
| Ciclos de revisão independente                 | 19 (`REVIEW-01` … `REVIEW-19`) |
| Correções originadas de revisão                | 19 (`FIX-01` … `FIX-19`)       |
| ADRs                                           | 14                             |
| Tarefas no quadro, com responsável e evidência | 60                             |
| Linhas em `src/` / `tests/`                    | 6.863 / 8.175                  |

Mais linha de teste que de produção não foi meta; foi consequência de exigir regressão para cada defeito fechado.

### Como as duas conversavam

Elas não compartilham contexto. O protocolo é de arquivo: `docs/TASKS.md` registra quem é dono de qual arquivo **antes** de editar, e cada tarefa termina num handoff em `docs/handoffs/` com o que foi feito, como foi verificado e o que ficou aberto. Uma sessão nova retoma pelo estado, não pela memória.

Isso resolveu um problema prático: duas assistentes editando o mesmo arquivo se sobrescrevem. Com posse declarada, não aconteceu.

---

## Um uso que funcionou bem

Pedi uma decisão de arquitetura com o problema inteiro na mão, não um trecho de código:

> Os quatro clientes discordam em estrutura, idioma, formato de data, formato de número, máscara de CNPJ e vocabulário de situação. Não quero um módulo por cliente — isso faz cada contrato novo virar alteração de produto. Qual é o eixo de variação certo, e o que precisa ser dado em vez de código?

O que aproveitei quase inteiro: **o eixo de variação é a forma de entrega, não o cliente**. Saíram quatro adaptadores (`nested-json`, `paired-csv`, `flat-json`, `split-json`) e um **perfil** por cliente que declara, em dados, o mapeamento de campo, o formato de data, a notação numérica por campo, o vocabulário de situação e a máscara de documento.

O resultado se sustentou sob pressão: Gama e Delta entraram na Parte 2 **sem mudar uma coluna** do banco, e hoje quatro adaptadores atendem **cinco** perfis — a variante do Beta que exporta em Windows-1252 é perfil, não caminho de código.

O que **não** aceitei dessa resposta: a sugestão de que notação numérica fosse um único campo por cliente. O Gama tem quantidade em inteiro simples e preço em centavos na mesma linha — com um campo só, a conversão de centavos comeria também a quantidade. Separei em `numberFormat: { quantity, money }`. Está registrado em [ADR-012](docs/decisions/ADR-012-notacao-por-campo.md) e tem teste próprio.

---

## Onde a IA errou, e como percebi

Aconteceu muito, e o repositório guarda cada caso. Três que valem contar, porque são classes diferentes de erro.

### 1. A correção que criou o defeito seguinte — oito vezes seguidas

O caso mais instrutivo não é um erro isolado: é um **padrão**. De `REVIEW-09` a `REVIEW-17`, cada correção revelou o próximo defeito, sempre na mesma região — o ciclo de vida do item que chega sem cabeçalho.

`FIX-10` juntou lock, leitura e escrita numa transação só. `REVIEW-10` mostrou que eu tinha criado uma transação **por linha**. `FIX-11` agrupou por pedido. `REVIEW-11` mostrou que o lote quebrava o agrupamento. E assim por diante, até `FIX-18`.

**Como percebi:** não percebi sozinho — a revisão independente percebeu, oito vezes. O que mudou o jogo foi parar de perguntar "está corrigido?" e começar a perguntar **"por que isto continua acontecendo no mesmo lugar?"**.

**O que fiz:** as correções que quebraram o ciclo foram as que tornaram o erro **impossível por construção**, não vigiado. A última é um invariante: _carga terminada não deixa linha não publicada_. Não é "verifique se sobrou" — é "é impossível sobrar", e se sobrar o relatório diz. Depois dela, `REVIEW-18` passou sem achados, a primeira vez em dez ciclos.

### 2. Um dublê de teste que mentia, e invalidava uma categoria inteira

A suíte usa um repositório em memória para provar a cadeia rota → caso de uso → adaptador sem precisar de banco. A IA escreveu esse dublê — e ele **nunca implementou o cursor**.

Devolvia `nextCursor: null` sempre, ignorava o cursor recebido e não conferia a impressão digital dos filtros. Pior: emitia `hasMore: true` junto com `nextCursor: null`, um envelope que o repositório real nunca produz. Os identificadores eram `order-1`, `order-2` — que não são UUID e ordenam errado, com `order-10` vindo antes de `order-2`.

O efeito: **todo teste de paginação na borda HTTP era vazio.** Eles passavam porque nunca paginavam.

**Como percebi:** não foi lendo o dublê. Foi seguindo uma instrução do usuário — _"após cada correção, verifique as coisas ao redor"_. Fui olhar a vizinhança da paginação e abri o dublê por curiosidade.

**O que fiz:** o dublê passou a usar o **mesmo codec** de cursor do repositório real, e ids UUID v7 de verdade. E a frase que mede o tamanho do buraco: **nenhum teste existente quebrou quando o dublê passou a paginar de verdade.** Se eles estivessem provando algo, pelo menos um teria reclamado.

Disso veio a regra que uso desde então: **toda guarda é quebrada de propósito para ver o teste ficar vermelho.** Ela pegou, mais tarde, um teste **meu** de teto de cursor que não reprovava — eu montava a entrada a partir da própria constante, então ele acompanhava qualquer valor ([TEST-AUDIT-01](docs/handoffs/TEST-AUDIT-01-claude.md)). E pegou um caso parecido no `validate-sweep`: a primeira versão dele terminava a varredura **antes** de qualquer escrita concorrente, então passava sem provar o cenário que existia para provar.

Registro completo em [FINAL-01](docs/handoffs/FINAL-01-claude.md).

### 3. Ler "verde" onde havia vermelho

Ao validar o trabalho da outra assistente, rodei `npm run check | grep ...`. O **pipe descarta o código de saída** do comando. O check estava falhando, eu vi silêncio e commitei.

**Como percebi:** o defeito reapareceu na execução seguinte, agora sem pipe.

**O que fiz:** passei a capturar o código de saída explicitamente em toda verificação, e o episódio ficou escrito no handoff — não escondido. Da mesma classe: eu afirmei que a cobertura publicada "descrevia uma execução parcial", e depois tive de me corrigir, porque a linha **sempre disse** "sem banco". O exagero está retratado no próprio documento ([TEST-AUDIT-01](docs/handoffs/TEST-AUDIT-01-claude.md)).

### O contraponto honesto

Nas 19 revisões independentes, **nenhum achado foi falso positivo**. A IA revisora errou pouco apontando; a IA implementadora errou bastante construindo. Isso diz algo sobre onde a ferramenta é confiável: ela é melhor achando problema em código pronto do que acertando de primeira num problema com muitas invariantes.

---

## Como garanti que entendo o que estou entregando

Quatro práticas, todas visíveis no repositório.

**1. Reproduzir antes de aceitar.** Nenhum achado de revisão virou correção sem eu reproduzir o defeito primeiro, com uma sonda contra o serviço rodando. Se eu não conseguia reproduzir, eu não entendia — e não corrigia. Cada handoff de `FIX` mostra a sonda e a saída dela.

**2. Verificar contra o sistema real, não contra o teste.** `scripts/validate-case.mjs` faz uma asserção por exigência do enunciado contra o serviço no ar. `npm run validate:http` roda 17 cenários por `fetch`, sem `app.inject`. E `npm run audit:fidelity` compara 156 campos entre o arquivo de entrada e o PostgreSQL, derivando o esperado **à mão, sem importar nada de `src/`** — porque comparar a aplicação com ela mesma não prova nada.

**3. Exigir a medição em vez do argumento.** A passagem estrutural antes da gravação só entrou porque foi medida: 0,6 s contra 83 s, 1% do custo da carga. O teto de requisições por minuto foi medido, não escolhido. O ganho do cursor sobre `OFFSET` está em número: a última faixa de páginas custa cerca de metade da primeira.

**4. Mandar explicar, e discordar quando não fechava.** Discordei de decisões propostas pela IA em pontos registrados: a notação numérica única (virou por campo, [ADR-012](docs/decisions/ADR-012-notacao-por-campo.md)); a validação de CNPJ por checksum, que eu quis adotar e que **reprovaria todas as sete amostras do enunciado**, porque os números são fictícios — virou política por perfil, desligada por padrão ([ADR-013](docs/decisions/ADR-013-checksum-e-bibliotecas-p1-04.md)).

### O teste honesto disso

A prova de que entendo não é afirmação minha: é que o repositório tem **testes que leem o próprio código-fonte** e falham quando a documentação discorda dele. Eles pegaram quatro derivas reais — o cabeçalho da ingestão, todos os nomes de parte, os limites de página e o contrato de erro, que era publicado aninhado e em maiúsculas enquanto o serviço responde plano e em minúsculas.

Para a defesa oral, o documento que escrevi para mim mesmo é [docs/HARD-PARTS.md](docs/HARD-PARTS.md): treze problemas, cada um em quatro movimentos — o problema, por que a resposta óbvia falha, a decisão e como está provada.

---

## O que eu faria diferente

- **Teria separado implementação de revisão desde o primeiro commit.** Comecei pedindo revisão para quem escreveu, e as primeiras revisões foram fracas por isso.
- **Teria escrito o teste de recusa junto com a guarda, sempre.** Adotei isso tarde, e três guardas ficaram meses sem prova de que recusavam.
- **Teria rodado o CI de verdade mais cedo.** Executei cada comando do pipeline à mão e achei que equivalia. Não equivale: na primeira execução real um job falhou, porque `test:integration` exigia um `.env` que é gitignored — e num checkout limpo o Node aborta antes de rodar teste nenhum. A diferença que pegou foi o checkout limpo, que a minha máquina nunca é.
