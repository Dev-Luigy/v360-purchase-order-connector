# Implantar em VPS

Passo a passo para pôr o serviço no ar atrás de HTTPS, com os comandos que você roda no servidor.

**Isto exige VPS.** Hospedagem compartilhada não serve: o serviço precisa de Docker e de um PostgreSQL 17 como processo próprio.

## O que já estava pronto

As duas portas do `compose.yaml` são publicadas em `127.0.0.1`:

```yaml
- '127.0.0.1:${API_PORT:-3000}:3000'
- '127.0.0.1:${DB_PORT:-55432}:5432'
```

Então, num VPS, **nada fica exposto** ao subir. Nem a API nem o banco respondem de fora. Quem fala com a internet é só o proxy, e ele conversa com o loopback. Não precisa mexer nisso.

## 1. Subir o serviço

```sh
# no VPS, com Docker e Docker Compose instalados
git clone https://github.com/Dev-Luigy/v360-purchase-order-connector.git
cd v360-purchase-order-connector

cp .env.example .env
```

Edite o `.env`:

```ini
NODE_ENV=production
LOG_LEVEL=info

# Trocar a senha do banco. O compose.yaml usa v360/v360 por padrão, que serve
# para desenvolvimento e não para uma máquina na internet.
DATABASE_URL=postgresql://v360:TROQUE_ESTA_SENHA@db:5432/v360

# Quem pode informar o IP de origem por X-Forwarded-For.
# Com o proxy no mesmo host, é `loopback`. Vazio ignora o cabeçalho, e aí
# todos os clientes chegam com o IP do proxy e dividem uma quota só.
TRUST_PROXY=loopback
```

```sh
docker compose up -d
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/ready   # tem que dar 200
```

> A senha do banco também vive em `compose.yaml`, em `POSTGRES_PASSWORD`. Troque nos dois lugares, com o mesmo valor.

## 2. Pôr o proxy na frente

A aplicação **não tem autenticação** — é decisão registrada, porque o enunciado exclui do escopo. Rodar assim no Compose local é uma coisa; deixar na internet aberta uma API que aceita carga de dados é outra. Por isso o proxy traz Basic Auth.

O [`Caddyfile`](Caddyfile) deste diretório faz TLS automático, Basic Auth e repassa para o loopback. Caddy foi a escolha por obter e renovar o certificado sem configuração — o que, num ambiente que ninguém vai operar depois, importa mais que flexibilidade.

```sh
# gerar o hash da senha
docker run --rm caddy:2 caddy hash-password --plaintext 'a-senha-que-voce-escolher'

sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # trocar o domínio, o usuário e o hash
sudo systemctl reload caddy
```

E no DNS, um registro `A` do seu domínio para o IP do VPS. O Caddy só consegue o certificado depois que o domínio resolver.

## 3. Conferir que ficou de pé

```sh
curl -u usuario:senha https://seu-dominio/ready
curl -u usuario:senha https://seu-dominio/purchase-orders?limit=2

# e o que NÃO deve responder de fora:
curl --max-time 5 http://IP-DO-VPS:3000/ready       # tem que falhar
curl --max-time 5 http://IP-DO-VPS:55432            # tem que falhar
```

Os dois últimos falharem é parte do teste, não problema.

Carregar as amostras, já no ar:

```sh
API_URL=https://usuario:senha@seu-dominio node scripts/validate-case.mjs
```

## Portas, se precisar mudar

`API_PORT` e `DB_PORT` no `.env` mudam só o lado do host. Útil quando já existe algo em 3000.

## O que eu faria antes de chamar isto de produção

Nenhum destes é exigido pelo desafio, e os três são reais:

- **Autenticação na aplicação, não no proxy.** Basic Auth no Caddy protege o acesso, mas não distingue clientes: o `clientId` continua sendo afirmado por quem chama, sem prova. O certo é derivá-lo da identidade autenticada.
- **Credencial separada para migração.** Hoje migração e runtime usam a mesma, então o processo que atende requisição tem permissão de DDL.
- **Backup.** O volume `postgres_data` sobrevive a reinício e a `docker compose down`, mas não a `down -v` nem à perda da máquina. Um `pg_dump` em cron resolve o básico.
