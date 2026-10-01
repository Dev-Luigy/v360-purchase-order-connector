# FIX-20 — multipart ilegível virava `erro_interno`

- Responsável: Claude, 2026-10-01.
- Estado: concluída.
- Origem: o usuário rodou `docs/video/chamadas.http` no kulala.nvim e a primeira chamada falhou.

## Dois problemas, e só um era meu

Fui ler o código do plugin em vez de supor, e a investigação separou as causas.

**O meu:** escrevi `docs/video/chamadas.http` com LF puro. O kulala monta o corpo preservando o terminador de cada linha (`lua/kulala/parser/request.lua:240`), e multipart exige CRLF. Os blocos multipart do arquivo passaram a ter CRLF; o resto segue LF.

De passagem, confirmei o que eu tinha levantado como suspeita e estava **errado**: o caminho relativo resolve certo. `FS.get_file_path` usa o diretório do buffer, não o diretório de trabalho (`lua/kulala/utils/fs.lua:66`), então `../../tests/fixtures/...` funciona a partir de `docs/video/`.

**O da aplicação:** um corpo multipart ilegível respondia **500 `erro_interno`**.

```text
antes: HTTP 500  {"error":"erro_interno","message":"erro inesperado ao processar a requisição"}
agora: HTTP 400  {"error":"carga_invalida","message":"corpo multipart ilegível: Unexpected end of multipart data"}
```

O busboy lança `Error: Unexpected end of multipart data` — um `Error` simples, sem `statusCode` —, e `toProblem` o tratava como defeito interno. É erro de **quem enviou**, e o código certo já existia: `carga_invalida` é descrito em `docs/API.md` como "multipart que não dá para ler".

É a mesma classe que já tinha mordido este projeto antes, quando recusa do framework (429, 413, 415) virava 500. Lá a correção foi honrar o `statusCode` que o framework atribui; aqui não há `statusCode` nenhum para honrar.

## A distinção que a correção precisa fazer

Nem todo erro dentro do spool é do cliente. Disco cheio e permissão negada são nossos e devem continuar 500. O discriminador é `syscall`: erro de sistema tem, erro de parser não.

A conversão mora em `spoolMultipart`, que é quem lê o multipart — e não em `toProblem`, que teria de casar mensagem de biblioteca por texto.

## Provado nos dois sentidos

| Corpo            | Resposta             |
| ---------------- | -------------------- |
| multipart com LF | `400 carga_invalida` |
| o mesmo com CRLF | `200`, carga aceita  |

A segunda linha é o que dá valor à primeira: sem ela, a asserção de recusa passaria também num serviço que rejeitasse **todo** multipart, inclusive o válido.

Conferido contra a imagem de produção reconstruída, não só em teste.

## Observação

Este defeito estava lá desde o início e nenhuma das 19 revisões o encontrou — porque todas as sondas de multipart foram feitas por `curl -F` ou por `app.inject` com corpo bem formado. Foi preciso um cliente HTTP diferente, montando o corpo de outro jeito, para expô-lo. Vale como lembrete de que a variedade de clientes é parte da superfície de teste.
