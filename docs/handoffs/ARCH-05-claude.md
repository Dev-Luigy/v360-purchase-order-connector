# Handoff: ARCH-05 — desenho de observabilidade

- Agente e data: Claude, 2026-09-27.
- Estado: concluída como registro. Implementação diferida por decisão do usuário.
- Objetivo e resultado: o usuário pediu conexão automática com um Grafana e um Prometheus já em execução, com consentimento de quem executa e painéis organizados. Resultado: [ADR-005](../decisions/ADR-005-observabilidade.md). Nada foi implementado: sem dependência instalada, sem endpoint, sem serviço novo no Compose.
- Arquivos alterados: `docs/decisions/ADR-005-observabilidade.md`, `docs/decisions/README.md`, `docs/TASKS.md`, este handoff.
- Contratos e decisões: nenhum contrato de aplicação afetado. ADR-005 fixa exposição por `/metrics`, auto-registro no Prometheus por `file_sd`/`docker_sd`, escrita idempotente no Grafana por HTTP API, consentimento por `OBSERVABILITY_REGISTER` sem prompt no boot, convenção de nomes e labels de cardinalidade limitada, e stack própria atrás de `--profile observability`.
- Correções feitas ao pedido original, que valem para quem implementar:
  - Prometheus não recebe registro: ele raspa. Sem `file_sd`, `docker_sd` ou receiver de `remote_write` no lado do cliente, não há automação possível — o honesto é imprimir o `scrape_config`.
  - Prompt no start do servidor está descartado: sem TTY em `docker compose up -d`, bloquearia o boot e quebraria o healthcheck. O consentimento virou configuração mais comando explícito com `--dry-run`.
  - A porta padrão do Grafana é 3000, a mesma da nossa API. Detectar "Grafana em localhost:3000" pode ser a nossa própria aplicação, então escrita só depois de `GET /api/health` confirmar Grafana. O preflight de ENV-04 já barra a colisão de porta.
  - Identificador por registro como label (número de pedido, CNPJ, material) está proibido: derrubaria o Prometheus do cliente.
- Validação: nenhuma, e por um motivo verificado — não há Grafana, Prometheus, exporter nem coletor OTel nesta máquina, instalado ou em execução, e as portas 3000, 3001, 9090, 9091, 9093, 9100, 3100, 4317, 4318 e 8428 estavam livres. `npm run check` verde após a mudança documental.
- Pendências ou bloqueios: implementação depende de P1-01 e P1-03, porque `client_id`, `format` e `divergence_code` só existem depois do contrato e dos adaptadores. Entra depois de P1-05.
- Próxima ação: P1-01 em `feat/p1-01-contrato-normalizado`.
- Posse: reservas de ARCH-05 liberadas.
- Revisão: não realizada por outro agente.
