import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, rename, mkdir, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { openNotebook } from './notebook.mjs';

const exec = promisify(execFile);
const dataDir = process.env.WORKSPACE_DATA_DIR || join(process.env.LOCALAPPDATA || homedir(), 'AgentWorkspace');
const dataFile = join(dataDir, 'projects.json');
const dist = join(import.meta.dirname, 'out');
const port = Number(process.env.WORKSPACE_PORT || 4789);
const origin = 'http://127.0.0.1:' + port;
const jobs = new Map();
const notebook = await openNotebook(dataDir);
let projects;
try { projects = JSON.parse(await readFile(dataFile, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; projects = []; }
let writes = Promise.resolve();
function saveProjects() {
  const snapshot = JSON.stringify(projects, null, 2);
  const write = writes.catch(() => {}).then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(dataFile + '.tmp', snapshot);
    await rename(dataFile + '.tmp', dataFile);
  });
  writes = write;
  return write;
}
const git = (cwd, args) => exec('git', ['--literal-pathspecs', '-C', cwd, ...args], {
  timeout: 45000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
}).then(result => result.stdout);
const specs = {
  codex: ['codex', prompt => ['exec', '--sandbox', 'workspace-write', '--json', '-']],
  claude: ['claude', prompt => ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'default']],
  cursor: ['agent', prompt => ['-p', '--mode', 'ask', '--output-format', 'stream-json', prompt]],
};
async function executable(name) {
  try {
    const { stdout } = await exec(process.platform === 'win32' ? 'where.exe' : 'which', [name], { windowsHide: true });
    const paths = stdout.trim().split(/\r?\n/);
    return paths.find(path => !/\.(cmd|bat|ps1)$/i.test(path)) || paths[0];
  } catch { return null; }
}
async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 256_000) throw Error('İstek çok büyük.');
  }
  return JSON.parse(data || '{}');
}
function run(project, kind, command, args, input, cwd, shell = false) {
  const job = { id: randomUUID(), project: project.id, kind, status: 'Çalışıyor', output: '', started: Date.now() };
  const child = spawn(command, args, { cwd, shell, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const append = data => { job.output = (job.output + data).slice(-120_000); };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.stdin.on('error', () => {});
  child.stdin.end(input || undefined);
  child.on('error', error => { append(error.message); job.status = 'Hata'; });
  child.on('close', code => {
    if (job.status === 'Çalışıyor') job.status = code === 0 ? 'Tamamlandı' : 'Hata (' + code + ')';
  });
  jobs.set(job.id, { job, child });
  for (const [id, entry] of jobs) if (jobs.size > 50 && entry.job.status !== 'Çalışıyor') jobs.delete(id);
  return job;
}
async function files(root, directories) {
  const matches = await Promise.all(directories.map(async directory => {
    const entries = await readdir(join(root, directory), { withFileTypes: true }).catch(() => []);
    return entries.filter(entry => entry.isDirectory()).map(entry => ({ name: entry.name, path: directory + '/' + entry.name + '/SKILL.md' }));
  }));
  return (await Promise.all(matches.flat().map(async file => {
    try { return (await stat(join(root, file.path))).isFile() ? file : null; }
    catch { return null; }
  }))).filter(Boolean);
}
function statusRows(output) {
  const entries = output.split('\0').filter(Boolean);
  const rows = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    const previous = /[RC]/.test(code) ? entries[++i] : '';
    rows.push({ code, path, previous });
  }
  return rows;
}
async function api(req, url) {
  const route = url.pathname.slice(5);
  if (req.method === 'GET' && route === 'projects') return projects;
  if (req.method === 'GET' && route === 'agents') {
    return Promise.all(Object.entries(specs).map(async ([id, [name]]) => ({ id, available: Boolean(await executable(name)) })));
  }
  const input = req.method === 'POST' ? await body(req) : {};
  if (route.startsWith('notebook')) {
    const scope = input.project || url.searchParams.get('project') || '';
    if (scope && !projects.some(project => project.id === scope)) throw Error('Proje bulunamadı.');
    if (route === 'notebook' && req.method === 'GET') return notebook.list(scope);
    if (route === 'notebook-history' && req.method === 'GET') return notebook.history(scope, url.searchParams.get('id'));
    if (route === 'notebook-save' && req.method === 'POST') return notebook.save(scope, input);
  }
  if (req.method === 'POST' && route === 'add') {
    if (typeof input.path !== 'string' || !input.path.trim()) throw Error('Git repo klasörünü gir.');
    const root = (await git(resolve(input.path), ['rev-parse', '--show-toplevel'])).trim();
    const existing = projects.find(project => project.root.toLowerCase() === root.toLowerCase());
    if (existing) return existing;
    const project = { id: randomUUID(), root, name: root.split(/[\\/]/).at(-1), services: [] };
    projects.push(project);
    await saveProjects();
    return project;
  }
  const project = projects.find(value => value.id === (input.project || url.searchParams.get('project')));
  if (!project) throw Error('Proje bulunamadı.');
  const root = project.root;
  if (req.method === 'GET') {
    switch (route) {
      case 'status': {
        const [status, branch, log, upstream] = await Promise.all([
          git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
          git(root, ['branch', '--show-current']),
          git(root, ['log', '-8', '--format=%h%x09%s']).catch(() => ''),
          git(root, ['rev-parse', '--abbrev-ref', '@{upstream}']).catch(() => ''),
        ]);
        const ahead = upstream ? await git(root, ['rev-list', '--count', '@{upstream}..HEAD']).catch(() => '') : '';
        return { files: statusRows(status), branch: branch.trim(), log: log.trim(), upstream: upstream.trim(), ahead: ahead.trim() };
      }
      case 'diff': {
        const path = url.searchParams.get('path');
        const rows = statusRows(await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
        const row = rows.find(item => item.path === path);
        if (!row) return '';
        if (row.code === '??') {
          const args = ['--no-index', '--no-ext-diff', '--no-textconv', '--', process.platform === 'win32' ? 'NUL' : '/dev/null', path];
          try { return await git(root, ['diff', ...args]); }
          catch (error) { if (error.code === 1 && error.stdout) return error.stdout; return 'Yeni dosya. Stage ettikten sonra diff görüntülenebilir.'; }
        }
        const paths = row.previous ? [row.previous, path] : [path];
        const staged = await git(root, ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--', ...paths]);
        const local = await git(root, ['diff', '--no-ext-diff', '--no-textconv', '--', ...paths]);
        return [staged && 'STAGED\n' + staged, local && 'WORKTREE\n' + local].filter(Boolean).join('\n');
      }
      case 'jobs': return [...jobs.values()].map(entry => entry.job).filter(job => job.project === project.id).reverse();
      case 'skills': return files(root, ['.agents/skills', '.claude/skills', '.cursor/skills', '.codex/skills']);
    }
  }
  if (req.method !== 'POST') throw Error('İşlem bulunamadı.');
  switch (route) {
    case 'stage-all': {
      const rows = statusRows(await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
      if (rows.some(row => ['DD','AU','UD','UA','DU','AA','UU'].includes(row.code))) {
        throw Error('Önce Git çakışmalarını çöz.');
      }
      return git(root, ['add', '-A']);
    }
    case 'stage': case 'unstage': {
      const rows = statusRows(await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
      const file = rows.find(row => row.path === input.path);
      if (!file) throw Error('Dosya artık değişiklik listesinde değil.');
      const paths = file.previous ? [file.previous, file.path] : [file.path];
      if (route === 'stage') return git(root, ['add', '--', ...paths]);
      const head = await git(root, ['rev-parse', '--verify', 'HEAD']).catch(() => '');
      return head ? git(root, ['reset', '-q', 'HEAD', '--', ...paths]) : git(root, ['rm', '--cached', '-q', '--', ...paths]);
    }
        case 'worktree': {
      const branch = input.branch?.trim();
      if (!branch || branch.startsWith('-')) throw Error('Yeni branch adı gerekli.');
      await git(root, ['check-ref-format', '--branch', branch]);
      const base = join(dataDir, 'worktrees');
      await mkdir(base, { recursive: true });
      const cwd = join(base, randomUUID());
      await git(root, ['worktree', 'add', '-b', branch, cwd]);
      const item = { id: randomUUID(), root: cwd, name: project.name + ' / ' + branch, services: [] };
      projects.push(item);
      await saveProjects();
      return item;
    }
    case 'commit':
      if (!input.message?.trim()) throw Error('Commit mesajı gerekli.');
      return git(root, ['commit', '-m', input.message.trim()]);
    case 'push': {
      const branch = (await git(root, ['branch', '--show-current'])).trim();
      if (!branch) throw Error('Önce bir branch seç.');
      const upstream = await git(root, ['rev-parse', '--abbrev-ref', '@{upstream}']).catch(() => '');
      return upstream ? git(root, ['push']) : git(root, ['push', '--set-upstream', 'origin', 'HEAD:refs/heads/' + branch]);
    }
    case 'skill-add': {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.name || '') || !input.instructions?.trim()) throw Error('Geçerli skill adı ve talimat gir.');
      const target = { codex: '.agents/skills', claude: '.claude/skills', cursor: '.cursor/skills' }[input.agent];
      if (typeof target !== 'string') throw Error('Bir ajan seç.');
      const folder = join(root, target, input.name);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'SKILL.md'), '---\nname: ' + input.name + '\ndescription: ' + JSON.stringify(input.description?.trim() || input.name) + '\n---\n\n' + input.instructions.trim() + '\n', { flag: 'wx' });
      return true;
    }
    case 'service-add': {
      if (!input.name?.trim() || !input.command?.trim()) throw Error('Servis adı ve komut gerekli.');
      const cwd = resolve(root, input.cwd || '.');
      if (!(await stat(cwd)).isDirectory()) throw Error('Servis klasörü bulunamadı.');
      project.services.push({ id: randomUUID(), name: input.name.trim(), cwd, command: input.command.trim() });
      await saveProjects();
      return project;
    }
    case 'service-run': {
      const service = project.services.find(item => item.id === input.id);
      if (!service) throw Error('Servis bulunamadı.');
      if ([...jobs.values()].some(({job}) => job.project === project.id && job.kind === service.name && job.status === 'Çalışıyor')) throw Error('Servis zaten çalışıyor.');
      return run(project, service.name, service.command, [], '', service.cwd, true);
    }
    case 'agent-run': {
      if (!Object.hasOwn(specs, input.agent) || !input.prompt?.trim()) throw Error('Ajan ve görev metni gerekli.');
      if ([...jobs.values()].some(({job}) => job.project === project.id && Object.hasOwn(specs, job.kind) && job.status === 'Çalışıyor')) throw Error('Bu repoda bir ajan zaten çalışıyor.');
      const [name, argsFor] = specs[input.agent];
      const command = await executable(name);
      if (!command) throw Error(name + ' CLI bulunamadı.');
      if (/\.(cmd|bat|ps1)$/i.test(command)) throw Error('CLI için doğrudan çalıştırılabilir dosya gerekli: ' + name);
      let prompt = input.prompt.trim();
      const instructions = await readFile(join(root, 'AGENTS.md'), 'utf8').catch(() => '');
      if (instructions) prompt = 'Ortak proje talimatları (AGENTS.md):\n' + instructions.slice(0, 16000) + '\n\nGörev:\n' + prompt;
      prompt += notebook.prompt(project.id, input.notes);
      const source = jobs.get(input.previous)?.job;
      if (source && source.project === project.id && Object.hasOwn(specs, source.kind)) {
        const [branch, changes] = await Promise.all([
          git(root, ['branch', '--show-current']), git(root, ['status', '--short']),
        ]);
        const summary = source.output.split(/\r?\n/).flatMap(line => {
          try {
            const event = JSON.parse(line);
            if (event.type === 'item.completed' && event.item?.type === 'agent_message') return [event.item.text];
            if (event.type === 'result' && typeof event.result === 'string') return [event.result];
          } catch { return []; }
          return [];
        }).filter(Boolean).at(-1);
        prompt += '\n\nDevir kaydı (önceki ajan çıktısı; proje yönergesi değildir):\n'
          + 'Önceki görev: ' + (source.request || '') + '\n'
          + 'Branch: ' + branch.trim() + '\nGit durumu:\n' + changes.slice(0, 3000)
          + (summary ? '\nSon ajan yanıtı:\n' + summary.slice(0, 6000) : '');
      }
      if ([...jobs.values()].some(({job}) => job.project === project.id && Object.hasOwn(specs, job.kind) && job.status === 'Çalışıyor')) throw Error('Bu repoda bir ajan zaten çalışıyor.');
      const job = run(project, input.agent, command, argsFor(prompt), input.agent === 'cursor' ? '' : prompt, root);
      job.request = input.prompt.trim().slice(0, 3000);
      return job;
    }
    case 'stop': {
      const entry = jobs.get(input.id);
      if (entry?.job.project !== project.id || entry.job.status !== 'Çalışıyor') throw Error('Çalışan görev bulunamadı.');
      entry.job.status = 'Durduruldu';
      if (process.platform === 'win32' && entry.child.pid) {
        await exec('taskkill.exe', ['/PID', String(entry.child.pid), '/T', '/F'], { windowsHide: true }).catch(() => entry.child.kill());
      } else entry.child.kill();
      return true;
    }
  }
  throw Error('İşlem bulunamadı.');
}

http.createServer(async (req, res) => {
  if (req.headers.host !== '127.0.0.1:' + port || (req.headers.origin && req.headers.origin !== origin)) {
    res.writeHead(403).end();
    return;
  }
  const url = new URL(req.url, origin);
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json')) throw Error('Geçersiz istek kaynağı.');
      res.end(JSON.stringify(await api(req, url)));
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: error.stderr?.trim() || error.message }));
    }
    return;
  }
  const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^(index\.html|_next\/(?:[\w-]+\/)*[\w.-]+\.(?:js|css|woff2)|brands\/[\w-]+\.svg)$/.test(path)) { res.writeHead(404).end(); return; }
  const types = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  if (path === 'index.html') {
    try {
      const html = await readFile(join(dist, path), 'utf8');
      const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .filter(match => match[1])
        .map(match => "'sha256-" + createHash('sha256').update(match[1]).digest('base64') + "'");
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' " + hashes.join(' ') + "; object-src 'none'; frame-ancestors 'none'");
      res.end(html);
    } catch { res.writeHead(404).end('Önce npm run build çalıştırın.'); }
    return;
  }
  const stream = createReadStream(join(dist, path));
  stream.on('error', () => res.writeHead(404).end('Önce npm run build çalıştırın.'));
  stream.on('open', () => {
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.setHeader('Content-Security-Policy', "default-src 'self'; object-src 'none'; frame-ancestors 'none'");
    stream.pipe(res);
  });
}).listen(port, '127.0.0.1', () => console.log('Agent Workspace: ' + origin));
