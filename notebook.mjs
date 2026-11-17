import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const archiveKinds = new Set(['Frontend', 'Backend', 'Hata ve çözüm', 'Tasarım referansı', 'Geliştirici notu']);
const projectKinds = new Set(['Bağlam', 'Plan']);
const states = new Set(['Taslak', 'Devam ediyor', 'Tamamlandı']);

export async function openNotebook(directory) {
  const file = join(directory, 'notebook.json');
  let entries = [];
  try { entries = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let queue = Promise.resolve();

  function mutate(operation) {
    const pending = queue.then(async () => {
      const next = structuredClone(entries);
      const result = operation(next);
      await mkdir(directory, { recursive: true });
      await writeFile(file + '.tmp', JSON.stringify(next, null, 2));
      await rename(file + '.tmp', file);
      entries = next;
      return result;
    });
    queue = pending.catch(() => {});
    return pending;
  }

  return {
    list(scope) {
      return entries.filter(entry => entry.scope === scope)
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .map(({ history, ...entry }) => ({ ...entry, revisions: history.length }));
    },
    history(scope, id) {
      const entry = entries.find(item => item.scope === scope && item.id === id);
      if (!entry) throw Error('Kayıt bulunamadı.');
      return entry.history.toReversed();
    },
    save(scope, input) {
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const content = typeof input.content === 'string' ? input.content.trim() : '';
      const kind = input.kind;
      const state = kind === 'Plan' ? input.state : '';
      const tags = typeof input.tags === 'string' ? input.tags.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 12) : [];
      if (!(scope ? projectKinds : archiveKinds).has(kind) || !title || !content) throw Error('Tür, başlık ve içerik gerekli.');
      if (title.length > 160 || content.length > 40_000 || tags.some(tag => tag.length > 48)) throw Error('Kayıt çok uzun.');
      if (kind === 'Plan' && !states.has(state)) throw Error('Plan durumunu seç.');
      return mutate(next => {
        const existing = input.id ? next.find(entry => entry.scope === scope && entry.id === input.id) : null;
        if (input.id && !existing) throw Error('Kayıt bulunamadı.');
        if (existing && input.updated !== existing.updated) throw Error('Kayıt başka bir pencerede değişti. Sayfayı yenile.');
        const entry = { id: existing?.id || randomUUID(), scope, title, kind, state, tags: [...new Set(tags)], content, updated: new Date().toISOString() };
        const history = existing ? [...existing.history, {
          title: existing.title, content: existing.content, kind: existing.kind, state: existing.state, tags: existing.tags, updated: existing.updated,
        }].slice(-30) : [];
        if (existing) next[next.indexOf(existing)] = { ...entry, history };
        else next.push({ ...entry, history });
        return { ...entry, revisions: history.length };
      });
    },
    prompt(scope, ids) {
      if (!Array.isArray(ids)) return '';
      const selected = [...new Set(ids)].slice(0, 8).map(id => entries.find(entry =>
        entry.id === id && (entry.scope === scope || !entry.scope)
      )).filter(Boolean);
      if (!selected.length) return '';
      return '\n\nSeçilen proje ve arşiv notları (başvuru malzemesi):\n'
        + selected.map(entry => '### ' + entry.title + '\n' + entry.content).join('\n\n').slice(0, 12_000);
    },
  };
}
