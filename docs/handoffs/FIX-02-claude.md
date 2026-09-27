# Handoff: FIX-02 — verificação pós-FIX-01

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: passada adversarial sobre o que FIX-01 entregou, a pedido do usuário. Dois defeitos encontrados nos leitores em fluxo, ambos corrigidos, e as notações que Alfa e Beta não exercitam ganharam teste. Um terceiro problema foi encontrado, é de **contrato**, e está registrado abaixo sem correção porque exige decisão.

## Defeitos corrigidos

1. **A origem não era destruída quando quem consome parava no meio.** `break` no laço deixava o `ReadStream` com `destroyed: false` — descritor de arquivo vazado. P1-04 vai consumir estes adaptadores e pode parar cedo por limite de lote, erro ou desconexão. Os dois leitores passam a destruir origem e destino em `finally`.
2. **Erro da origem era anunciado como erro de encoding.** O `try` em volta do laço de decodificação capturava também a falha de quem produz os bytes, então "origem da carga caiu no meio" chegava como "conteúdo não é utf-8 válido". O laço saiu do `try`: só a chamada de `decode` é envolvida.

Os dois vieram da mesma pergunta — o que acontece nos caminhos que o teste feliz não percorre — e nenhum dos dois aparece com a suíte passando.

## Cobertura

Medida de novo, o que REVIEW-01 tinha deixado pendente: **98,07% de linhas e 87,11% de branches**, contra 96,00% e 81,53% antes de FIX-01. O que faltava não era caso raro: eram as notações `cents` e `unix-seconds` e os campos `conversionFactor`, `lineCreatedOn` e `assumedCurrency`, escritos para a Parte 2 e sem nenhum teste. Código sem teste que parece pronto é pior que código ausente, porque a Parte 2 confiaria nele.

Agora há teste para as duas notações e um perfil sintético (`sigma`) que exercita os três campos e, de quebra, demonstra a promessa de ADR-008: cliente novo em forma conhecida entra só com perfil, sem código novo.

## Problema de contrato, sem correção — precisa de decisão

**`ClientProfile.numberFormat` é uma notação só para todos os campos numéricos, e o Gama não cabe nisso.** Na mesma linha da amostra, `qtd_ped` é `10` e `fator_conv` é `12` em inteiro simples, enquanto `preco_unit_centavos` é `120000` em centavos. Declarar `numberFormat: 'cents'` converteria também a quantidade e o fator, que virariam `0,10` e `0,12`.

Isto não afeta Alfa nem Beta — cada um usa uma notação só para tudo —, mas bloqueia a Parte 2 e mora em `src/domain/client.ts`, que é contrato. A correção provável é separar a notação de dinheiro da notação de quantidade no perfil, ou permitir notação por campo no mapa. Não foi feita aqui porque muda contrato e o escopo desta tarefa era verificar.

## Validação

`npm run check` verde: tipagem, lint, formatação, **86 testes** e build. Nada tocou banco, HTTP ou Docker.

## Pendências e próxima ação

- Decidir a notação por campo antes da Parte 2; abrir ADR quando decidida.
- P1-02 continua sendo o caminho crítico para P1-04.
- Fora do escopo, não é meu: `scripts/activate-node.sh` segue apagado e o `README.md:41` ainda o referencia.
- Posse: reservas de FIX-02 liberadas.
- Revisão: não realizada.
