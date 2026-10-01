# Falas — só o texto, para ler na gravação

Para deixar na segunda tela. Os comandos de cada bloco estão em [`chamadas.http`](chamadas.http); o roteiro com as duas coisas juntas, em [`roteiro.md`](roteiro.md). Para a conversa depois do vídeo, [`perguntas.md`](perguntas.md).

**433 palavras de fala, que somam 2 min 48 s** a cerca de 155 palavras por minuto. Os doze segundos que faltam para os três minutos são os intervalos em que você roda o comando e a saída aparece na tela — por isso a fala não preenche o tempo inteiro.

Se você fala rápido, respire nos pontos. Sobra tempo, não falta.

---

## 0:00 · sem tela, olhando para a câmera

Uma empresa emite um pedido de compra, o fornecedor entrega e manda a nota, e alguém confere se a nota bate com o pedido antes de pagar.

Esse serviço faz isso para quatro clientes que exportam os pedidos em formatos completamente diferentes — e entrega um contrato único.

`— 48 palavras · ~19s`

---

## 0:15 · as quatro cargas · chamadas 1 a 4

JSON aninhado, dois CSV em português com vírgula decimal, tudo achatado com timestamp Unix e centavos, e duas consultas separadas.

Mesma rota para os quatro. O que muda é o **perfil** do cliente, que é dado, não código.

O cliente vai no caminho da URL e nunca é deduzido do conteúdo — o Delta usa os mesmos nomes de campo do Alfa.

`— 62 palavras · ~24s`

---

## 0:40 · consulta unificada · chamada 5

Os quatro clientes, no mesmo contrato. Data em ISO, decimal como texto, situação em três valores.

Nada aqui lembra o formato de origem.

`— 23 palavras · ~9s`

## 0:55 · achar um pedido · chamada 6

Acho um pedido pelo número que o cliente usa.

Os ids são UUID, mas ninguém precisa decorar um: a identidade de negócio é cliente mais número, porque o mesmo número existe em clientes diferentes.

`— 35 palavras · ~14s`

---

## 1:15 · nota conforme · chamada 7

Nota conforme: aprovada, sem divergência.

Repare que não precisei do UUID — a plataforma conhece o número do pedido, não a nossa identidade interna.

`— 25 palavras · ~10s`

## 1:30 · nota divergente · chamada 8

Devolve **todas** as divergências, não a primeira, com código estruturado — a plataforma mostra ao usuário sem adivinhar.

`— 19 palavras · ~7s`

## 1:40 · caixa para unidade · chamada 9

O pedido do Gama está em caixas de doze. A nota fala em unidades, como toda nota de fornecedor.

Vinte e quatro unidades são duas caixas, e aprova.

O fator de conversão faz a ponte, e a comparação é decimal exata — nenhum valor passa por ponto flutuante neste serviço.

`— 50 palavras · ~19s`

---

## 2:00 · Delta sem cabeçalho · chamada 10

As duas consultas do Delta podem não retratar o mesmo instante. Mandei só os itens, e um aponta para um pedido que eu não recebi.

Ele não vira pedido inventado nem é descartado: fica esperando, e entra quando o cabeçalho chegar — mesmo em outra requisição, horas depois.

E nasce invisível para outras cargas, para duas ingestões simultâneas não consumirem uma a espera da outra.

`— 65 palavras · ~25s`

---

## 2:25 · relatório e paginação · chamadas 11 e 12

Requisito três: quantas notas passaram, quantas travaram e por quais motivos.

E toda lista é paginada por cursor. O cursor carrega o recorte e o teto da varredura, então percorrer dezenas de milhares de pedidos de madrugada, enquanto novas cargas entram, termina — sem repetir nem pular nenhum.

`— 49 palavras · ~19s`

---

## 2:45 · fechamento · chamada 13, e a página `/docs`

A API navegável é gerada dos mesmos schemas que validam as requisições, então ela não tem como divergir do serviço.

Tem mais no repositório: trinta asserções, uma por exigência do enunciado, contra o serviço no ar; e uma auditoria que compara campo a campo o arquivo de entrada com o que ficou no banco.

Obrigado.

`— 57 palavras · ~22s`

---

## Se precisar cortar

Na ordem em que eu cortaria, de menos a mais custoso:

1. **0:55 · achar um pedido** — a consulta unificada já mostrou o contrato. Economiza 14s.
2. **1:15 · nota conforme** — vá direto para a divergente, que mostra mais. Economiza 10s.
3. **2:25 · a frase da paginação** — fica no README. Economiza 12s.

Não corte o **1:40 (caixa para unidade)** nem o **2:00 (Delta sem cabeçalho)**: são os dois momentos que mostram regra de negócio de verdade, e o segundo é o mais difícil do projeto.

## Se algo falhar ao vivo

Não corte a gravação. Diga o que aconteceu e siga — a recuperação explica mais sobre você do que a tomada perfeita.
