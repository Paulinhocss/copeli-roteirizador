const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '../..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function versaoNumero(valor) {
  return String(valor || '').replace(/^v/, '').split('.').map(Number);
}

function maiorOuIgual(atual, minima) {
  const a = versaoNumero(atual);
  const b = versaoNumero(minima);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

function comando(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: raiz,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return (r.stdout || r.stderr || '').trim();
}

console.log('[LOCAL] Verificando ambiente e dependencias...');
console.log('[INFO] Raiz:', raiz);

const node = process.version;
console.log('[INFO] Node:', node);
if (!maiorOuIgual(node, '24.19.0')) {
  console.error('[ERRO] Node 24.19+ obrigatorio.');
  process.exit(1);
}
console.log('[OK] Runtime Node alinhado (24.19+).');

const npm = comando(npmCmd, ['--version']);
if (!maiorOuIgual(npm, '11.0.0')) {
  console.error('[ERRO] npm 11+ obrigatorio. Atual:', npm);
  process.exit(1);
}
console.log('[OK] npm', npm);

const git = comando('git', ['--version']);
console.log('[OK]', git || 'git disponivel');

if (!fs.existsSync(path.join(raiz, 'node_modules'))) {
  console.error('[ERRO] node_modules nao encontrado. Execute npm install.');
  process.exit(1);
}
console.log('[OK] Dependencias instaladas.');

if (fs.existsSync(path.join(raiz, '.env'))) {
  console.log('[OK] .env encontrado.');
} else {
  console.warn('[AVISO] .env nao encontrado. Integracoes locais dependerao das variaveis do ambiente.');
}

const processos = [];

function iniciar(nome, workspace) {
  console.log('[START]', nome);
  const filho = spawn(npmCmd, ['--workspace', workspace, 'run', 'dev'], {
    cwd: raiz,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  processos.push(filho);
  filho.on('exit', (codigo) => {
    if (codigo && codigo !== 0) {
      console.error('[ERRO]', nome, 'encerrou com codigo', codigo);
      encerrar(codigo);
    }
  });
}

let encerrando = false;
function encerrar(codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  for (const processo of processos) {
    if (!processo.killed) processo.kill();
  }
  process.exitCode = codigo;
}

process.on('SIGINT', () => encerrar(0));
process.on('SIGTERM', () => encerrar(0));

console.log('[INFO] API: http://localhost:3001');
console.log('[INFO] WEB: http://localhost:5173');

iniciar('API', '@copeli/control-tower-api');
iniciar('WEB', '@copeli/control-tower-web');
