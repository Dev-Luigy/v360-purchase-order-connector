# DEPLOY-01 — implantação em VPS atrás de proxy

- Responsável: Claude, 2026-10-01.
- Estado: concluída, com a execução no servidor pendente do usuário.
- Origem: o usuário quer a aplicação hospedada, tem VPS, DNS e VPN, e passou uma chave de API da Hostinger.

## Por que eu não implantei

**O sandbox desta sessão bloqueia materializar credencial.** Tentei os dois caminhos — gravar num arquivo fora do repositório e passar inline no comando — e os dois foram recusados pelo classificador, com `Credential Materialization` e `Credential Leakage`. Não contornei.

Então a chave não me serve, e segue exposta no histórico da conversa junto com um token do GitHub de antes. As duas precisam ser revogadas.

O que dava para fazer, e foi feito: preparar o que falta para a implantação ser dois comandos no servidor.

## O que já estava certo

As duas portas do `compose.yaml` são publicadas em `127.0.0.1`, não em `0.0.0.0`. Num VPS, subir o Compose **não expõe nada** — nem a API nem o banco. O proxy fala com o loopback. Nada a mudar aqui, e vale registrar porque é o tipo de coisa que normalmente é defeito de implantação.

## O que faltava: `trustProxy`

Sem ele, o teto de requisições por origem conta o IP do **proxy**: todos os clientes passam a dividir uma quota só, e a varredura noturna de um cliente estrangula os outros. Com ele ligado sem proxy na frente, o oposto e pior: qualquer cliente manda `X-Forwarded-For` e escapa do teto mandando um valor novo a cada requisição.

Os dois extremos erram, então a confiança é declarada no ambiente e **nasce desligada**: `TRUST_PROXY` vazio ignora o cabeçalho. Com proxy no mesmo host, `loopback`.

### Um erro meu no caminho

Modelei primeiro como **contagem de saltos** (`TRUST_PROXY=1`), por analogia com outras bibliotecas. O typecheck reprovou com uma mensagem confusa sobre `Http2SecureServer` não ser atribuível a `Server` — que parece erro de sobrecarga e não de valor.

Fui ler o tipo instalado em vez de insistir:

```ts
trustProxy?: boolean | string | string[] | TrustProxyFunction
```

**Não aceita número.** O valor inválido fazia o TypeScript descartar a sobrecarga de HTTP/1 e cair na de HTTP/2, e o erro falava do sintoma. Refiz como lista de endereços confiáveis, que é o que a biblioteca oferece e é mais seguro: `loopback` honra o cabeçalho só quando quem conecta é o próprio host, enquanto `true` confiaria em qualquer um.

## Provado nos dois sentidos

Teste em `tests/bordas.test.ts`, e depois contra a imagem de produção reconstruída:

| Configuração                 | IP que a aplicação registra    | Esperado           |
| ---------------------------- | ------------------------------ | ------------------ |
| `TRUST_PROXY` vazio (padrão) | `172.18.0.1` — o real          | ignora o cabeçalho |
| `TRUST_PROXY=172.18.0.0/16`  | `203.0.113.7` — o do cabeçalho | honra o cabeçalho  |

A primeira linha é a que importa: mandei `x-forwarded-for: 203.0.113.7` e a aplicação não acreditou. A segunda existe para a primeira não ser vazia — sem ela, um serviço que nunca olhasse o cabeçalho passaria igual.

O teste unitário teve um tropeço parecido: eu adicionava o hook de observação **depois** do `app.ready()`, e o Fastify recusa com `Fastify instance is already listening. Cannot call "addHook"!`. Hook antes do `ready`.

## O resto da preparação

- `deploy/Caddyfile` — TLS automático, Basic Auth e repasse para o loopback. Validado pelo próprio Caddy: `Valid configuration`. Caddy e não Nginx porque obtém e renova certificado sem configuração, o que importa num ambiente que ninguém vai operar depois.
- `deploy/README.md` — passo a passo, incluindo os dois `curl` que **devem falhar**: as portas da API e do banco acessadas pelo IP público. Falhar ali é o teste passando.
- `.env.example` — `TRUST_PROXY` documentado com o porquê.

O Basic Auth está no proxy porque a aplicação não tem autenticação, por decisão registrada — o enunciado exclui do escopo. Rodar sem ela no Compose local é uma coisa; deixar na internet aberta uma API que aceita carga de dados é outra.

## O que o runbook diz que falta para ser produção

Nenhum é exigido pelo desafio, e os três são reais: autenticação na aplicação em vez de no proxy, para o `clientId` deixar de ser afirmado sem prova; credencial separada para migração, porque hoje o processo que atende requisição tem DDL; e backup, porque o volume sobrevive a reinício mas não à perda da máquina.

## Verificação

`npm run check`: saída 0, **262 testes, 0 falhas** (eram 260; dois novos). Imagem reconstruída, `/ready` em 200, e os dois sentidos do `trustProxy` conferidos nela.
