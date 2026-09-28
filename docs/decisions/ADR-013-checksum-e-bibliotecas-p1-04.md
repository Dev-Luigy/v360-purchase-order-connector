# ADR-013 — Checksum de CNPJ por perfil, e bibliotecas da borda HTTP

- Estado: aceita.
- Data: 2026-09-28.
- Responsável pelo registro: Claude; tarefa P1-04.
- Autoridade: escolhas explícitas do usuário, em conversa sobre código escrito à mão versus biblioteca.

## Contexto

Duas perguntas do usuário: o que ainda é algoritmo nosso que uma biblioteca faria melhor, e o que a borda HTTP vai precisar.

O levantamento mostrou que das 3.898 linhas de `src/` a maior parte não tem substituto — regras de conferência, contrato, perfis, adaptadores estruturais e repositórios. O que é de fato algoritmo escrito à mão são três arquivos: `decimal.ts`, `field-parsers.ts` e `cursor.ts`.

## Decisões

**O invólucro do `Decimal` fica.** A aritmética já é `decimal.js` desde ADR-011; o que é nosso são as guardas, e elas pegaram defeitos reais ao longo das revisões: arredondamento silencioso em soma e produto, `'0x10'` virando 16, notação exponencial vazando para o contrato. São cerca de oitenta linhas que impedem o resto do código de errar com dinheiro.

**Datas continuam com os nossos parsers.** Consideramos `date-fns` e descartamos por um motivo concreto: a API de data do JavaScript opera em fuso local por padrão, e este projeto precisa de UTC explícito — `Intl.DateTimeFormat('pt-BR')` formata `2026-08-15T00:00:00Z` como `14/08/2026`, que é exatamente o deslocamento de um dia que ADR-006 existe para impedir. Trocar quarenta linhas testadas por uma dependência que reintroduz a armadilha não é ganho.

**`cpf-cnpj-validator` entra, e o checksum é política por perfil, desligada por padrão.**

O usuário escolheu adotar a validação de dígito verificador. Ao verificar antes de implementar, descobrimos que **nenhum dos sete CNPJs do enunciado passa no checksum** — são números fictícios. Ligar a validação como obrigatória rejeitaria todas as fixtures, todos os testes e a demonstração do avaliador.

Então o perfil ganha `validatesTaxIdChecksum`, falso para Alfa, Beta, Gama e Delta e documentado como tal. A capacidade fica pronta, testada e a um booleano de distância para um cliente com dado real. Isto **substitui** a justificativa anterior, de que checksum criaria rejeição incorrigível: a razão continua válida para dado fictício, e por isso virou política declarada em vez de ausência.

**Bibliotecas da borda HTTP, para P1-04:**

- `@fastify/type-provider-zod` liga os schemas que já existem ao request e à resposta, com inferência no handler. É onde as revisões mais apontaram risco de deriva entre validação e tipo.
- `@fastify/multipart` 10.1.2 para upload em fluxo, acima do advisory de negação de serviço que afetava versões anteriores à 10.1.1. Limites explícitos de tamanho, número de arquivos, partes e campos; nunca `toBuffer`.
- `@fastify/rate-limit` para quota por identidade. O usuário pediu junto; a ressalva de REVIEW-04 fica registrada — com múltiplas réplicas exige store compartilhado, que hoje seria infraestrutura sem requisito.
- `fast-check` como dependência de desenvolvimento, para teste por propriedade em decimal, cursor, notações e cortes de chunk — as áreas onde as revisões acharam borda que não prevíamos.

## Alternativas consideradas

`Dinero.js` para dinheiro: descartada porque não resolve quantidade nem fator de conversão, que não são dinheiro; ficaríamos com duas bibliotecas de número e a guarda ainda seria necessária. Enxugar o `Decimal` para só parse e format: descartada, perderia a guarda de exatidão em soma e produto, que é a que pegou o defeito de arredondamento silencioso. Checksum obrigatório com fixtures substituídas por CNPJ válido: descartada, falsificaria os dados do enunciado, que DOC-01 versionou exatamente pela fidelidade.

## Consumidores e pendências

P1-04 usa o provider Zod em toda rota e o multipart na ingestão. `parseTaxId` passa a receber a política do perfil.

Pendência: o store compartilhado do rate limit, se houver mais de uma réplica. E confirmar a política de checksum com cada cliente real no onboarding, que é quando o booleano deixa de ser falso.
