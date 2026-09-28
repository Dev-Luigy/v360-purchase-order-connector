#!/usr/bin/env node
// Somente inspeciona Docker e portas; nunca altera recursos existentes.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';

const PROJECT = 'v360-purchase-order-connector';
const DEFAULTS = { API_PORT: '3000', DB_PORT: '55432' };
const CONNECT_TIMEOUT_MS = 700;

function readDotEnv(path) {
  try {
    const parsed = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match) parsed[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
    return parsed;
  } catch {
    return {};
  }
}

function setting(key, dotEnv) {
  return process.env[key] ?? dotEnv[key] ?? DEFAULTS[key];
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    ok: result.status === 0,
    out: (result.stdout ?? '').trim(),
    err: (result.stderr ?? '').trim(),
    missing: result.error?.code === 'ENOENT',
  };
}

function firstLine(text) {
  return text.split('\n')[0] ?? '';
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port: Number(port) });
    const finish = (inUse) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function containerPublishing(port) {
  const result = run('docker', [
    'ps',
    '--filter',
    `publish=${port}`,
    '--format',
    '{{.Names}}\t{{.Image}}\t{{.Label "com.docker.compose.project"}}',
  ]);
  if (!result.ok || !result.out) return null;
  const [name, image, project] = firstLine(result.out).split('\t');
  return { name, image, project: project ?? '' };
}

// Melhor esforço: sem privilégio, o `ss` mostra o socket mas costuma esconder o
// processo de outro usuário. Mesmo assim ajuda a identificar o ocupante.
function hostSocket(port) {
  const result = run('ss', ['-ltnpH', `sport = :${port}`]);
  return result.ok ? firstLine(result.out) : '';
}

function composeProjectConflict(cwd) {
  const result = run('docker', ['compose', 'ls', '--all', '--format', 'json']);
  if (!result.ok || !result.out) return null;
  let projects;
  try {
    projects = JSON.parse(result.out);
  } catch {
    return null;
  }
  if (!Array.isArray(projects)) return null;
  const existing = projects.find((project) => project?.Name === PROJECT);
  if (!existing) return null;
  const configFiles = String(existing.ConfigFiles ?? '');
  const ours = configFiles
    .split(',')
    .some((file) => file.trim().startsWith(cwd));
  return ours ? null : { configFiles, status: String(existing.Status ?? '') };
}

const problems = [];
const notes = [];
const dotEnv = readDotEnv('.env');
const cwd = process.cwd();

const version = run('docker', ['version', '--format', '{{.Server.Version}}']);
if (version.missing) {
  problems.push(
    'Docker não está instalado ou não está no PATH. Ver docs/SETUP.md.',
  );
} else if (!version.ok) {
  problems.push(
    `O daemon do Docker não respondeu: ${firstLine(version.err) || 'erro sem mensagem'}. Ver docs/SETUP.md.`,
  );
} else {
  notes.push(`Docker Engine ${version.out} respondendo.`);
}

const ports = [
  { key: 'API_PORT', label: 'API', port: setting('API_PORT', dotEnv) },
  { key: 'DB_PORT', label: 'PostgreSQL', port: setting('DB_PORT', dotEnv) },
];

if (ports[0].port === ports[1].port) {
  problems.push(
    `API_PORT e DB_PORT apontam para a mesma porta (${ports[0].port}).`,
  );
}

for (const { key, label, port } of ports) {
  if (!/^\d+$/.test(String(port))) {
    problems.push(`${key} não é um número de porta válido: "${port}".`);
    continue;
  }
  if (!(await portInUse(port))) {
    notes.push(`Porta ${port} (${label}) livre em 127.0.0.1.`);
    continue;
  }
  const container = containerPublishing(port);
  if (container?.project === PROJECT) {
    notes.push(
      `Porta ${port} (${label}) já é publicada pelo nosso container ${container.name}; subir de novo é idempotente.`,
    );
    continue;
  }
  if (container) {
    problems.push(
      `Porta ${port} (${label}) está publicada pelo container ${container.name} (imagem ${container.image}` +
        `${container.project ? `, projeto ${container.project}` : ', fora de um projeto Compose'}). ` +
        `Não vou subir por cima: defina ${key} no .env e rode de novo.`,
    );
    continue;
  }
  const socket = hostSocket(port);
  problems.push(
    `Porta ${port} (${label}) está ocupada por um processo do host, fora do Docker` +
      `${socket ? `: ${socket}` : ''}. Não vou subir por cima: defina ${key} no .env e rode de novo.`,
  );
}

const conflict = composeProjectConflict(cwd);
if (conflict) {
  problems.push(
    `Já existe um projeto Compose chamado "${PROJECT}" declarado em ${conflict.configFiles}` +
      `${conflict.status ? ` (${conflict.status})` : ''}, fora deste diretório. ` +
      'Subir daqui recriaria containers daquele projeto.',
  );
}

for (const note of notes) console.log(`  ok    ${note}`);
if (problems.length === 0) {
  console.log('\npreflight: nada em conflito, seguro subir o Compose.');
  process.exit(0);
}
for (const problem of problems) console.error(`  ERRO  ${problem}`);
console.error(
  '\npreflight: abortado sem tocar em nada. Portas publicadas são configuráveis' +
    ' por API_PORT e DB_PORT no .env; dentro da rede do Compose o banco continua em 5432.',
);
process.exit(1);
