# ADR-005 — Observabilidade com Grafana e Prometheus

- Estado: aceita como direção; implementação diferida para depois do marco `parte-1`.
- Data: 2026-09-27.
- Responsável pelo registro: Claude; tarefa ARCH-05.
- Aceite: usuário, nesta conversa. Pediu conexão automática com um Grafana e um Prometheus já em execução, com a pessoa que executa podendo aceitar ou não, e painéis organizados com nomes e filtros prontos. Ao ser apresentado o desenho, escolheu adiar a implementação ("nada agora; P1-01 primeiro") e manter as duas frentes: conectar em instância externa e oferecer uma stack própria atrás de um profile do Compose.

## Contexto

O serviço fica entre a plataforma V360 e o sistema do cliente, ligado o tempo todo, então visibilidade operacional tem valor real. O enunciado, porém, lista métricas entre o que **não** é pedido ([CASE.md](../CASE.md)), e os labels que dão sentido a um painel — cliente de origem, formato de entrega, código de divergência — só existem depois do contrato normalizado (P1-01) e dos adaptadores (P1-03). Registrar agora e implementar depois evita construir painel sobre rótulo inventado.

Verificado nesta máquina em 2026-09-27: nenhum Grafana, Prometheus, exporter ou coletor OTel em execução, nem instalado, nem como serviço. As portas 3000, 3001, 9090, 9091, 9093, 9100, 3100, 4317, 4318 e 8428 estavam livres. Ou seja, o alvo desta decisão é a máquina do cliente, não esta.

## Decisão

**1. Exposição.** A aplicação expõe `GET /metrics` no formato texto do Prometheus, com `prom-client`. No Compose continua publicado apenas em `127.0.0.1`, como o resto.

**2. Prometheus puxa; nós nos registramos por descoberta.** Não existe "cadastrar-se" em um Prometheus. Em ordem de preferência: `file_sd_configs`, escrevendo um alvo em diretório vigiado — o Prometheus recarrega sozinho, sem SIGHUP e sem restart; `docker_sd_configs`, quando o Prometheus lê o socket do Docker, caso em que basta o nosso Compose declarar os labels; `remote_write` apenas se o alvo declarar `--web.enable-remote-write-receiver`. Pushgateway está descartado: é para job batch e distorce `up` e staleness em serviço de longa duração. Quando nenhum caminho existir, a ferramenta imprime o bloco `scrape_config` pronto para colar, em vez de prometer automação impossível.

**3. Grafana aceita escrita, por HTTP API e de forma idempotente.** `POST /api/folders`, `POST /api/datasources` e `POST /api/dashboards/db` com `uid` fixo e `overwrite: true`; executar várias vezes converge para o mesmo estado, sem duplicar painel. Exige token de service account com permissão de editor. Antes de qualquer escrita, a identidade do alvo é confirmada por `GET /api/health`: a porta padrão do Grafana é 3000, a mesma da nossa API, e sem essa checagem a ferramenta poderia estar falando com o nosso próprio serviço.

**4. Consentimento por configuração, nunca por prompt no boot.** `OBSERVABILITY_REGISTER` aceita `no` (padrão), `ask` ou `yes`. `ask` só pergunta quando `process.stdin.isTTY`, com timeout cujo padrão é não; em container, CI ou `docker compose up -d` comporta-se como `no` e registra o motivo no log. O caminho principal é um comando explícito, `npm run observability:register`, com `--dry-run` que mostra pasta, datasource, dashboard e alvo de descoberta que seriam criados antes de escrever nada. Perguntar no start bloquearia o boot, quebraria o healthcheck e travaria em ambiente sem TTY.

**5. Nomes e labels.** Prefixo `v360_` e sufixo de unidade, seguindo a convenção do Prometheus: `v360_ingestion_orders_total`, `v360_ingestion_duration_seconds`, `v360_conference_checks_total`, `v360_http_request_duration_seconds`. Labels restritos a cardinalidade limitada: `client_id`, `format`, `outcome`, `divergence_code`. **Proibidos como label:** número de pedido, CNPJ, código de material e qualquer identificador por registro — explodem a contagem de séries e derrubariam o Prometheus do cliente, que é exatamente o dano que queremos evitar. Os "filtros prontos" são template variables do Grafana alimentadas por `label_values(...)`, então chegam preenchidas.

**6. Stack própria atrás de profile.** O Compose ganha `--profile observability` com Prometheus e Grafana nossos, provisionados por arquivo, para demonstrar o painel sem depender de instância externa. Nada disso sobe por padrão: `docker compose up` continua subindo só API e banco.

**7. Métrica não substitui o relatório do requisito 3.** O relatório de conferências precisa de histórico paginado que sobrevive a restart e é fonte de verdade: isso é banco. As métricas são a visão operacional em cima, com retenção e agregação próprias.

## Impacto e limites

Nenhuma dependência foi instalada e nenhum endpoint criado por este registro. `prom-client` entra na implementação com este ADR como a necessidade documentada que o `AGENTS.md` exige antes de adicionar biblioteca. Nada em `/ready` muda: o achado de que ele responde 200 sem schema segue aberto em [REVIEW-02](../handoffs/REVIEW-02-claude.md), mantido por decisão do usuário.

A decisão não escolhe versão de Grafana, de Prometheus, nem entre `prom-client` puro e um plugin de Fastify; isso fica para a tarefa de implementação. Também não cobre logs nem tracing.

## Validação e pendências

Nada foi validado contra Grafana ou Prometheus reais, porque não há nenhum em execução aqui. Ao implementar, validar: recarga automática do `file_sd` após escrita do alvo; idempotência do dashboard por `uid` em duas execuções seguidas; comportamento de `ask` sem TTY; recusa de escrita quando `GET /api/health` não confirmar Grafana; e cardinalidade real das séries com dados de carga.

Implementação depende de P1-01 e P1-03 e só entra depois de P1-05.
