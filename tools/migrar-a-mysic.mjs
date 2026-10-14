#!/usr/bin/env node
// tools/migrar-a-mysic.mjs
// Copia Yotubei dentro de un clon de Mysic aplicando las transformaciones
// mecánicas descritas en docs/IMPLEMENTACION_MYSIC.md (fase 2). NO edita
// archivos propios de Mysic salvo Backend/package.json y Backend/.gitignore.
//
// Uso:
//   node tools/migrar-a-mysic.mjs --mysic <ruta del repo Mysic> [--dry-run] [--force]
//
// Resultado:
//   <Mysic>/Backend/src/youtube/**          backend de Yotubei en ESM (.mjs)
//   <Mysic>/Frontend/src/features/youtube/** frontend de Yotubei con CSS aislado bajo .yt-app
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = '.yt-app';
const KEYFRAME_PREFIX = 'yt-';

/* ---------- argumentos ---------- */
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const mysicRoot = option('--mysic');
const dryRun = flag('--dry-run');
const force = flag('--force');

if (!mysicRoot) {
  console.error('Uso: node tools/migrar-a-mysic.mjs --mysic <ruta del repo Mysic> [--dry-run] [--force]');
  process.exit(1);
}
const MYSIC = path.resolve(mysicRoot);
for (const required of ['Backend/server.js', 'Backend/package.json', 'Frontend/src/lib/api.js']) {
  if (!fs.existsSync(path.join(MYSIC, required))) {
    console.error(`No parece un repo de Mysic: falta ${required} en ${MYSIC}`);
    process.exit(1);
  }
}

const BACKEND_SRC = path.join(ROOT, 'backend', 'src');
const FRONTEND_SRC = path.join(ROOT, 'frontend', 'src');
const BACKEND_DEST = path.join(MYSIC, 'Backend', 'src', 'youtube');
const FRONTEND_DEST = path.join(MYSIC, 'Frontend', 'src', 'features', 'youtube');

for (const dest of [BACKEND_DEST, FRONTEND_DEST]) {
  if (fs.existsSync(dest) && !force) {
    console.error(`Ya existe ${path.relative(MYSIC, dest)}. Usa --force para sobrescribirlo.`);
    process.exit(1);
  }
}

/* ---------- utilidades ---------- */
const written = [];
function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}
// Lee un archivo de texto normalizando finales de línea (tolera clones con CRLF en Windows)
function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}
function write(file, content) {
  written.push(path.relative(MYSIC, file));
  if (dryRun) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function mustReplace(content, from, to, where) {
  if (!content.includes(from)) throw new Error(`Transformación no aplicable en ${where}: no se encontró\n${from}`);
  return content.replace(from, to);
}

/* ---------- backend: .js -> .mjs ---------- */
// Reescribe especificadores relativos que terminan en .js: import/export ... from, import(), new URL()
function rewriteRelativeImports(code) {
  return code
    .replace(/(from\s+['"])(\.{1,2}\/[^'"]+)\.js(['"])/g, '$1$2.mjs$3')
    .replace(/(import\(\s*['"])(\.{1,2}\/[^'"]+)\.js(['"])/g, '$1$2.mjs$3')
    .replace(/(new URL\(\s*['"])(\.{1,2}\/[^'"]+)\.js(['"])/g, '$1$2.mjs$3');
}

function migrateBackend() {
  if (force && !dryRun) fs.rmSync(BACKEND_DEST, { recursive: true, force: true });
  for (const file of listFiles(BACKEND_SRC)) {
    const rel = path.relative(BACKEND_SRC, file);
    if (rel === 'server.js') continue; // Mysic tiene su propio servidor
    let code = readText(file);
    code = rewriteRelativeImports(code);
    if (rel === 'config.js') {
      // backendRoot pasa a ser Backend/src dentro de Mysic: los datos van a Backend/data/youtube
      code = mustReplace(
        code,
        "path.join(backendRoot, 'data')",
        "path.join(backendRoot, '..', 'data', 'youtube')",
        rel
      );
      code = mustReplace(code, 'process.env.DATA_DIR', 'process.env.YOUTUBE_DATA_DIR', rel);
    }
    const header = `// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.\n`;
    write(path.join(BACKEND_DEST, rel.replace(/\.js$/, '.mjs')), header + code);
  }
}

/* ---------- frontend: CSS aislado ---------- */
// Prefija cada selector con .yt-app, convierte :root en .yt-app, elimina reglas de
// html/body y renombra los @keyframes para que no choquen con los de Mysic.
function scopeSelector(selector) {
  const s = selector.trim();
  if (!s) return null;
  if (s === ':root') return SCOPE;
  if (s === 'html' || s === 'body') return null;
  if (s.startsWith(':root ')) return `${SCOPE} ${s.slice(6)}`;
  return `${SCOPE} ${s}`;
}

function findBlockEnd(css, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < css.length; i += 1) {
    if (css.startsWith('/*', i)) {
      i = css.indexOf('*/', i + 2) + 1;
      continue;
    }
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('Llave sin cerrar en el CSS');
}

function scopeCss(css, keyframes) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    // comentarios y espacios se copian tal cual
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2) + 2;
      out += css.slice(i, end);
      i = end;
      continue;
    }
    if (/\s/.test(css[i])) {
      out += css[i];
      i += 1;
      continue;
    }
    const open = css.indexOf('{', i);
    const semicolon = css.indexOf(';', i);
    if (css[i] === '@' && semicolon >= 0 && (open < 0 || semicolon < open)) {
      out += css.slice(i, semicolon + 1); // @import / @charset
      i = semicolon + 1;
      continue;
    }
    if (open < 0) {
      out += css.slice(i);
      break;
    }
    const prelude = css.slice(i, open).trim();
    const close = findBlockEnd(css, open);
    const body = css.slice(open + 1, close);

    if (/^@(-webkit-)?keyframes\s/.test(prelude)) {
      const name = prelude.split(/\s+/)[1];
      keyframes.add(name);
      out += `${prelude.replace(name, KEYFRAME_PREFIX + name)} {${body}}`;
    } else if (/^@(media|supports|container|layer)\b/.test(prelude)) {
      out += `${prelude} {${scopeCss(body, keyframes)}}`;
    } else if (prelude.startsWith('@')) {
      out += `${prelude} {${body}}`;
    } else {
      const selectors = prelude.split(',').map(scopeSelector).filter(Boolean);
      if (selectors.length) out += `${selectors.join(',\n')} {${body}}`;
    }
    i = close + 1;
  }
  return out;
}

function renameAnimations(css, keyframes) {
  let result = css;
  for (const name of keyframes) {
    const re = new RegExp(`(animation(?:-name)?\\s*:[^;{}]*?)\\b${name}\\b`, 'g');
    result = result.replace(re, `$1${KEYFRAME_PREFIX}${name}`);
  }
  return result;
}

function migrateCss(file, code) {
  const keyframes = new Set();
  let css = scopeCss(code, keyframes);
  css = renameAnimations(css, keyframes);
  if (path.basename(file) === 'player.css') {
    // Dentro de Mysic la barra de Yotubei no puede ser fija a la ventana (taparía el PlayerDock):
    // queda pegada al fondo del contenedor con scroll de la sección.
    css = mustReplace(css, `${SCOPE} .player {\n  position: fixed;`, `${SCOPE} .player {\n  position: sticky;`, file);
  }
  return css;
}

/* ---------- frontend ---------- */
function migrateFrontend() {
  if (force && !dryRun) fs.rmSync(FRONTEND_DEST, { recursive: true, force: true });

  // Orden de las hojas de estilo, tomado de main.jsx
  const mainJsx = readText(path.join(FRONTEND_SRC, 'main.jsx'));
  const styleImports = [...mainJsx.matchAll(/^import\s+'(\.\/styles\/[^']+\.css)'/gm)].map((m) => m[1]);
  if (!styleImports.length) throw new Error('No se encontraron imports de estilos en main.jsx');

  for (const file of listFiles(FRONTEND_SRC)) {
    const rel = path.relative(FRONTEND_SRC, file).split(path.sep).join('/');
    if (rel === 'main.jsx') continue;
    let code = readText(file);
    let destRel = rel;

    if (rel.endsWith('.css')) {
      code = migrateCss(rel, code);
    } else if (rel === 'App.jsx') {
      destRel = 'YoutubeView.jsx';
      code = mustReplace(code, `function App(`, `function YoutubeView(`, rel);
      code = mustReplace(code, `export default App;`, `export default YoutubeView;`, rel);
      // El título lo pone Mysic; la vista no lleva <h1> propio
      code = code.replace(/^\s*<h1 className="title">.*<\/h1>\s*\n/m, '');
      // Estilos de la vista, en el mismo orden que main.jsx de Yotubei
      code = code.replace(
        /^(\/\/[^\n]*\n)+/,
        (headerComment) => `${headerComment}${styleImports.map((s) => `import '${s}'`).join('\n')}\n`
      );
    } else if (rel === 'lib/api.js') {
      // La URL de la API la decide Mysic (local, producción o Tauri); Yotubei cuelga de /youtube
      code = mustReplace(
        code,
        `export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\\/$/, '');`,
        `import { API_URL } from '../../../lib/api.js';\n\nexport const API_BASE = \`\${API_URL}/youtube\`;`,
        rel
      );
    }

    const header = rel.endsWith('.css')
      ? `/* Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera. */\n`
      : `// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.\n`;
    write(path.join(FRONTEND_DEST, destRel), header + code);
  }
}

/* ---------- dependencias y .gitignore del backend de Mysic ---------- */
function updateBackendPackage() {
  const yotubei = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'package.json'), 'utf8'));
  const file = path.join(MYSIC, 'Backend', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const needed = ['youtubei.js', 'bgutils-js', 'jsdom', 'sharp'];
  pkg.dependencies ||= {};
  const added = [];
  for (const dep of needed) {
    if (!pkg.dependencies[dep]) {
      pkg.dependencies[dep] = yotubei.dependencies[dep];
      added.push(`${dep}@${yotubei.dependencies[dep]}`);
    }
  }
  pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)));
  if (added.length) write(file, `${JSON.stringify(pkg, null, 2)}\n`);
  return added;
}

function updateBackendGitignore() {
  const file = path.join(MYSIC, 'Backend', '.gitignore');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (/^\/?data\/youtube\/?$/m.test(current)) return false;
  write(file, `${current.replace(/\s*$/, '\n')}\n# Yotubei: descargas y cachés\ndata/youtube/\n`);
  return true;
}

/* ---------- ejecución ---------- */
try {
  migrateBackend();
  migrateFrontend();
  const added = updateBackendPackage();
  const gitignore = updateBackendGitignore();

  console.log(`${dryRun ? '[simulación] ' : ''}Archivos escritos en ${MYSIC}:`);
  for (const f of written) console.log(`  ${f}`);
  console.log(added.length ? `Dependencias añadidas a Backend/package.json: ${added.join(', ')}` : 'Dependencias ya presentes.');
  console.log(gitignore ? 'Backend/.gitignore: añadido data/youtube/' : 'Backend/.gitignore ya ignoraba data/youtube/');
  console.log('\nSiguiente: ejecuta "npm install" en Backend y continúa con la fase 3 de docs/IMPLEMENTACION_MYSIC.md.');
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  console.error('No continúes: el código de Yotubei cambió y el script necesita actualizarse.');
  process.exit(1);
}
