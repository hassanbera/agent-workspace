import React, { useEffect, useState } from 'react';

const archiveKinds = ['Frontend', 'Backend', 'Hata ve çözüm', 'Tasarım referansı', 'Geliştirici notu'];
const projectKinds = ['Bağlam', 'Plan'];
const placeholders = {
  Frontend: 'Şablon, kütüphane, örnek kod veya uygulama kuralı',
  Backend: 'Mimari karar, performans örneği veya test yaklaşımı',
  'Hata ve çözüm': 'Belirti, neden, çözüm ve doğrulama',
  'Tasarım referansı': 'URL, beğendiğin ayrıntılar ve bunları nerede kullanacağın',
  'Geliştirici notu': 'Daha sonra tekrar başvurmak istediğin bilgi',
  Bağlam: 'Proje hedefi, güncel durum, kararlar ve açık sorular',
  Plan: 'Hedef, adımlar ve tamamlanma ölçütleri',
};
const newEntry = kind => ({ kind, title: '', content: '', tags: '', state: 'Taslak' });
const date = value => new Date(value).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

export function Notebook({ api, project = '' }) {
  const kinds = project ? projectKinds : archiveKinds;
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(null);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    api('notebook', { project }).then(values => {
      if (active) { setItems(values); setLoaded(true); }
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [api, project]);
  const query = search.trim().toLocaleLowerCase('tr');
  const visible = items.filter(item => (!filter || item.kind === filter) &&
    [item.title, item.content, ...item.tags].join(' ').toLocaleLowerCase('tr').includes(query));
  function select(entry) {
    setDraft({ ...entry, tags: entry.tags?.join?.(', ') ?? entry.tags });
    setHistory(null);
    setNotice('');
    setError('');
  }
  function change(field, value) {
    setDraft(previous => ({ ...previous, [field]: value }));
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await api('notebook-save', {}, { ...draft, project, state: draft.state || 'Taslak' });
      setItems(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
      select(saved);
      setNotice('Kaydedildi.');
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function revisions() {
    if (history) { setHistory(null); return; }
    setBusy(true);
    setError('');
    try { setHistory(await api('notebook-history', { project, id: draft.id })); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <div className="notebook">
    <div className="notebook-index">
      <div className="notebook-toolbar">
        <button className="primary" type="button" onClick={() => select(newEntry(filter || kinds[0]))}>Yeni kayıt</button>
        <input type="search" aria-label="Kayıtlarda ara" placeholder="Kayıtlarda ara" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      <div className="notebook-filters" aria-label="Kayıt türü">
        <button aria-pressed={!filter} onClick={() => setFilter('')}>Tümü</button>
        {kinds.map(kind => <button key={kind} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind}</button>)}
      </div>
      <div className="notebook-list">
        {visible.map(item => <button key={item.id} aria-pressed={draft?.id === item.id} disabled={busy} onClick={() => select(item)}>
          <span>{item.title}</span><small>{item.kind}{item.state && ' / ' + item.state}</small>
        </button>)}
        {!visible.length && <p className="muted">{!loaded && !error ? 'Kayıtlar okunuyor…' : items.length ? 'Aramana uyan kayıt yok.' : 'Henüz kayıt yok.'}</p>}
      </div>
    </div>
    <div className="notebook-editor">
      {error && <p className="banner error" role="alert">{error}</p>}
      {!draft ? <div className="notebook-empty"><h2>{project ? 'Bağlam ve planlar' : 'Bilgi arşivi'}</h2>
        <p>{project ? 'Kararları, açık soruları ve sonraki adımları proje içinde kaydet.' : 'Tekrar kullanacağın şablonları, çözümleri ve tasarım referanslarını kaydet.'}</p>
      </div> : <form className="notebook-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="notebook-meta">
            <label>Tür<select value={draft.kind} onChange={event => change('kind', event.target.value)}>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
            {draft.kind === 'Plan' && <label>Durum<select value={draft.state || 'Taslak'} onChange={event => change('state', event.target.value)}>{['Taslak', 'Devam ediyor', 'Tamamlandı'].map(state => <option key={state}>{state}</option>)}</select></label>}
            <label>Etiketler<input placeholder="go, test, react" value={draft.tags} onChange={event => change('tags', event.target.value)} /></label>
          </div>
          <label>Başlık<input className="note-title" maxLength="160" required value={draft.title} onChange={event => change('title', event.target.value)} /></label>
          <label>İçerik<textarea rows="12" maxLength="40000" required placeholder={placeholders[draft.kind]} value={draft.content} onChange={event => change('content', event.target.value)} /></label>
          <div className="notebook-actions"><button className="primary">Kaydet</button>
            {draft.revisions > 0 && <button type="button" onClick={revisions}>{history ? 'Geçmişi kapat' : 'Geçmişi aç'}</button>}
            {notice && <small role="status">{notice}</small>}
          </div>
        </fieldset>
      </form>}
      {history && <div className="notebook-history"><h2>Önceki sürümler</h2>{history.map((item, index) =>
        <details key={item.updated + index}><summary>{date(item.updated)} / {item.title}</summary><pre>{item.content}</pre></details>
      )}</div>}
    </div>
  </div>;
}
