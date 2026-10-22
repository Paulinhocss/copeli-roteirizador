const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const ignorar = new Set(['.git', 'node_modules', 'dist', '.vite']);
const extensoes = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.html']);

const padroes = [
  { nome: 'HERE hardcoded', regex: /(?:HERE_KEY|HERE_API_KEY)\s*[:=]\s*['"`]((?!process\.env)[^'"`]{8,})['"`]/g },
  { nome: 'Contele hardcoded', regex: /CONTELE_API_KEY\s*[:=]\s*['"`]([^'"`]{8,})['"`]/g },
  { nome: 'Senha Deak hardcoded', regex: /DEAK_DB_PASSWORD\s*[:=]\s*['"`]([^'"`]{4,})['"`]/g },
];

const falhas = [];

function visitar(dir) {
  for (const nome of fs.readdirSync(dir)) {
    if (ignorar.has(nome)) continue;
    const completo = path.join(dir, nome);
    const stat = fs.statSync(completo);
    if (stat.isDirectory()) {
      visitar(completo);
      continue;
    }
    if (!extensoes.has(path.extname(nome))) continue;
    const relativo = path.relative(raiz, completo).replaceAll('\\', '/');
    if (relativo === '.env.example') continue;
    const conteudo = fs.readFileSync(completo, 'utf8');
    for (const padrao of padroes) {
      padrao.regex.lastIndex = 0;
      if (padrao.regex.test(conteudo)) {
        falhas.push(relativo + ': ' + padrao.nome);
      }
    }
  }
}

visitar(raiz);

if (falhas.length) {
  console.error('[SEGREDOS] Possiveis credenciais hardcoded encontradas:');
  falhas.forEach((f) => console.error(' - ' + f));
  process.exit(1);
}

console.log('[SEGREDOS] OK: nenhuma credencial conhecida hardcoded no codigo executavel.');
