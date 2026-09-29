# Handoff: FINAL-01 — fechar o enunciado inteiro

- Agente e data: Claude, 2026-09-29.
- Estado: concluída.
- Objetivo: o usuário pediu para testar tudo contra o documento e, **a cada correção, examinar a vizinhança antes de seguir**. Reli `docs/CASE.md` linha a linha em vez de confiar na minha lista, e encontrei seis exigências sem prova.

## O que a releitura encontrou

| Lacuna                       | O que o enunciado diz                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| varredura **sob carga**      | "varre esse conjunto em lote, de madrugada, **enquanto novas cargas continuam entrando**" — o cenário que decidiu o cursor, nunca exercitado |
| Windows-1252 com CRLF        | "o parser precisa tolerar as duas coisas, e **uma fixture de variante deveria provar isso**" — não existia fixture                           |
| `ENCERRADO` do Beta          | termo que não aparece nas amostras; suposição nossa, sem prova de ponta a ponta                                                              |
| volume nos **formatos**      | "deve funcionar para qualquer volume **nesses formatos**", no plural; só o Beta tinha medição                                                |
| `closed` e `blocked` do Alfa | a fixture só traz `open`                                                                                                                     |
| robustez dos validadores     | dados de outro script derrubavam o validador                                                                                                 |

## A vizinhança, que é onde estava o mais grave

Seguir a regra do usuário rendeu mais do que as lacunas em si.

**O dobro em memória nunca implementou o cursor.** Devolvia `nextCursor: null` sempre, ignorava o cursor recebido e não conferia a impressão digital — então **todo teste de paginação na borda HTTP era vazio**, e ainda produzia `hasMore: true` com `nextCursor: null`, um envelope que o repositório real nunca emite. Passou a usar o **mesmo codec** do real, e os ids passaram a ser UUID v7 de verdade: os antigos `order-1`, `order-2` nem eram identificadores válidos, e ordenavam errado (`order-10` antes de `order-2`).

Que nenhum teste existente tenha quebrado quando o dobro passou a paginar de verdade diz o tamanho do buraco.

**A varredura depende de identificador monotônico, e nada travava isso.** Trocar `uuid(7)` por `uuid(4)` faria a varredura pular pedidos em silêncio, com a suíte inteira verde. O script prova o comportamento; a trava nova aponta a causa, e verifiquei que ela quebra ao trocar.

**Faltava consultar pedido por número.** A plataforma manda `purchaseOrderNumber` na conferência, então conhece o número — mas para achá-lo na consulta precisava varrer tudo. Descobri porque meu próprio conserto do validador passou a paginar 22 mil pedidos e bateu no teto de requisições. Entrou como filtro, com índice (migração `0006`) e na impressão digital do cursor — que é onde ele poderia ter passado despercebido.

**A suíte de integração dava trinta falhas quando o problema era ambiente.** Ela exige acesso exclusivo, o que estava documentado e não imposto. Agora recusa com uma mensagem.

## O que passou a ter prova

**Varredura sob carga** (`npm run validate:sweep`): 227 páginas varridas enquanto 3 lotes de cargas entravam; **zero repetidos**, e os 20.000 do conjunto inicial apareceram. A primeira versão deste script passou **sem provar nada** — a varredura terminava antes de qualquer escrita concorrente. Ele agora recusa o resultado se a sobreposição não aconteceu.

**Volume nos quatro formatos** (`npm run validate:volume -- 20000 3 <cliente>`), 20.000 pedidos e 60.000 itens cada:

| Formato              | Carga                 | Memória | Profundidade |
| -------------------- | --------------------- | ------- | ------------ |
| `alfa` (nested-json) | 86,9s — 230 pedidos/s | 524 MiB | 0,63×        |
| `beta` (paired-csv)  | 81,0s — 247 pedidos/s | 527 MiB | 0,43×        |
| `gama` (flat-json)   | 89,1s — 224 pedidos/s | 391 MiB | 0,58×        |
| `delta` (split-json) | 84,3s — 237 pedidos/s | 518 MiB | 0,64×        |

Nenhum rejeitado, nenhum repetido na varredura, e em todos a última página custa **menos** que a primeira. O Delta é o que mais consome, o que é coerente: é a única forma que mantém índice de cabeçalhos para juntar as duas consultas.

**Windows-1252 com CRLF, ponta a ponta.** `tests/fixtures/beta-erp/` é a fixture que o enunciado pede, em Windows-1252, com CRLF e sem quebra final. Entra pelas rotas e sai correta: `ENCERRADO` mapeado, CNPJ mascarado normalizado, data `dd/mm/aaaa` convertida e **acento intacto** depois de atravessar o banco (`Óleo de soja 900ml`, `Açúcar refinado 1kg`).

Ela entrou com um perfil novo, `beta-erp`, e **nenhuma linha de código** — que é exatamente a afirmação do ADR-008 que nunca tinha sido demonstrada.

**As três situações do Alfa** e a recusa de valor fora do vocabulário passaram a ser asserções do validador: `open`/`closed`/`blocked` traduzem, `suspended` é recusado e não gravado.

## Evidência

```
npm run check                 244 testes, 0 falhas
npm run test:integration       31 testes contra PostgreSQL real
npm run coverage               93,30% linhas, 90,13% branches
scripts/validate-case.mjs      30/30, duas execuções seguidas
npm run validate:http          10/10, duas execuções seguidas
npm run validate:sweep         sem repetir nem perder, sob carga
verify-persistence.mjs         pedidos e histórico sobrevivem ao reinício
```

## O que continua aberto

- **CI e política de exceção da auditoria npm**, adiados pelo usuário. É o último item de peso: hoje nada prova a poda da imagem a cada atualização de dependência.
- **A espera de itens órfãos não tem expiração nem cota**; `maxStagedOrders` limita a carga, não o acúmulo.
- **Uma réplica só.** A concorrência é testada de um processo contra uma API; o advisory lock é do PostgreSQL e deveria valer com mais réplicas, mas isso é raciocínio, não medição.
- **Separação de credenciais DDL/DML** fora do ambiente local.
- O caminho subprocesso do gerador de evidência tem teste só das funções puras.

## Estado deixado

- Posse: reservas de FINAL-01 liberadas.
- O banco local tem dados sintéticos das medições, com prefixos `VOL-`, `SW-` e `F14-`. `docker compose down -v` limpa.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam CLEAN-01 do Codex — no `schema.prisma` preparei o commit para levar só o índice novo. `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
