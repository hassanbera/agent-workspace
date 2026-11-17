import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { Notebook } from './notebook.jsx';
import codexIcon from '@lobehub/icons-static-svg/icons/codex-color.svg?no-inline';
import claudeIcon from '@lobehub/icons-static-svg/icons/claude-color.svg?no-inline';
import cursorIcon from '@lobehub/icons-static-svg/icons/cursor.svg?no-inline';

const names = { codex: 'Codex', claude: 'Claude Code', cursor: 'Cursor Agent' };
const icons = { codex: codexIcon, claude: claudeIcon, cursor: cursorIcon };
const palettes = [
  { id: 'daylight', title: 'Gün Işığı / Okyanus' },
  { id: 'graphite', title: 'Grafit / Mavi' },
  { id: 'paper', title: 'Kâğıt / Bordo' },
  { id: 'ink', title: 'Mürekkep / Kehribar' },
];
function AgentIcon({ id }) {
  return <img className={'agent-icon agent-icon-' + id} src={icons[id]} alt="" width="19" height="19" />;
}
const tabs = ['Değişiklikler', 'Ajanlar', 'Servisler', 'Bağlam ve planlar', 'Yetenekler'];
async function api(route, query = {}, payload) {
  const response = await fetch('/api/' + route + '?' + new URLSearchParams(query), payload === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error);
  return value;
}
function App() {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(localStorage.getItem('workspace.project') || '');
  const [agents, setAgents] = useState([]);
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [archive, setArchive] = useState(false);
  const [palette, setPalette] = useState(() => palettes.find(item => item.id === localStorage.getItem('workspace.palette.v2'))?.id || 'daylight');
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    localStorage.setItem('workspace.palette.v2', palette);
  }, [palette]);
  useEffect(() => {
    Promise.all([api('projects'), api('agents')]).then(([items, available]) => {
      setProjects(items);
      setSelected(current => items.some(item => item.id === current) ? current : items[0]?.id || '');
      setAgents(available);
    }).catch(error => setError(error.message));
  }, []);
  const project = projects.find(item => item.id === selected);
  function select(id) {
    setArchive(false);
    localStorage.setItem('workspace.project', id);
    setSelected(id);
  }
  async function add(event) {
    event.preventDefault();
    setError('');
    try {
      const item = await api('add', {}, { path });
      setProjects(current => current.some(project => project.id === item.id) ? current : [...current, item]);
      select(item.id);
      setPath('');
    } catch (error) { setError(error.message); }
  }
  return <div className="shell">
    <aside className="rail">
      <header className="brand"><span className="brand-sign" aria-hidden="true">/</span>Agent Workspace</header>
      <button className={'archive-link ' + (archive ? 'selected' : '')} aria-pressed={archive} onClick={() => setArchive(true)}>Bilgi arşivi</button>
      <nav aria-label="Projeler">
        <h2>Projeler</h2>
        {projects.map(item => <button key={item.id} className={!archive && item.id === selected ? 'selected' : ''} onClick={() => select(item.id)} title={item.root}>{item.name}</button>)}
      </nav>
      <form onSubmit={add} className="add">
        <label htmlFor="repo">Git repo klasörü</label>
        <input id="repo" value={path} onChange={event => setPath(event.target.value)} placeholder="C:\\projeler\\uygulama" required />
        <button>Projeyi ekle</button>
        {error && <p role="alert" className="error">{error}</p>}
      </form>
      <div className="availability">
        {agents.map(({ id, available }) => <div key={id}><AgentIcon id={id} />{names[id]}<small>{available ? 'Hazır' : 'CLI eksik'}</small></div>)}
        <details className="palettes"><summary>Renk paleti</summary>
          {palettes.map(item => <button key={item.id} aria-pressed={palette === item.id} onClick={() => setPalette(item.id)}>
            <span className={'swatch swatch-' + item.id} aria-hidden="true" />{item.title}
          </button>)}
        </details>
      </div>
    </aside>
    {archive ? <main className="archive-page"><header className="project-head"><h1>Geliştirici bilgi arşivi</h1></header><Notebook api={api} /></main> : project ? <Project onAdd={item => { setProjects(current => [...current, item]); select(item.id); }} key={project.id} project={project} agents={agents} onUpdate={item => setProjects(current => current.map(old => old.id === item.id ? item : old))} />
      : <main className="empty"><h1>İlk projeni ekle</h1><p>Sol panelden bir Git repo klasörü seç. Değişiklikler, ajanlar ve servisler burada görünür.</p></main>}
  </div>;
}

function Project({ project, agents, onUpdate, onAdd }) {
  const [tab, setTab] = useState(tabs[0]);
  const [git, setGit] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [skills, setSkills] = useState([]);
  const [file, setFile] = useState('');
  const [diff, setDiff] = useState('');
  const [message, setMessage] = useState('');
  const [agent, setAgent] = useState('codex');
  const [prompt, setPrompt] = useState('');
  const [handoff, setHandoff] = useState('');
  const [previous, setPrevious] = useState('');
  const [branch, setBranch] = useState('');
  const [jobId, setJobId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteOptions, setNoteOptions] = useState([]);
  const [notes, setNotes] = useState([]);
  const [autoContext, setAutoContext] = useState(true);
  const [suggested, setSuggested] = useState([]);
  const projectQuery = { project: project.id };
  useEffect(() => {
    if (tab !== 'Ajanlar') return;
    let active = true;
    Promise.all([api('notebook'), api('notebook', { project: project.id })]).then(([archive, projectNotes]) => {
      if (active) {
        setNoteOptions([...projectNotes, ...archive]);
        setSuggested([
          projectNotes.find(item => item.kind === 'Bağlam')?.id,
          projectNotes.find(item => item.kind === 'Plan' && item.state === 'Devam ediyor')?.id,
        ].filter(Boolean));
      }
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [project.id, tab]);
  useEffect(() => {
    let active = true;
    let timer;
    async function refresh() {
      try {
        const [status, runs, currentDiff] = await Promise.all([
          api('status', { project: project.id }), api('jobs', { project: project.id }),
          file ? api('diff', { project: project.id, path: file }) : '',
        ]);
        if (active) {
          setGit(status); setJobs(runs); setDiff(currentDiff);
          if (file !== null && !status.files.some(item => item.path === file)) setFile(status.files[0]?.path || '');
        }
      } catch (error) {
        if (active) setError(error.message);
      } finally {
        if (active) timer = setTimeout(refresh, 1800);
      }
    }
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [project.id, file]);
  useEffect(() => {
    if (tab !== 'Yetenekler') return;
    let active = true;
    api('skills', { project: project.id }).then(value => { if (active) setSkills(value); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [project.id, tab]);
  async function act(route, data = {}, onSuccess) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api(route, {}, { ...data, project: project.id });
      await onSuccess?.(result);
      if (['stage-all', 'stage', 'unstage', 'commit', 'push'].includes(route)) {
        const [status, currentDiff] = await Promise.all([
          api('status', projectQuery),
          file ? api('diff', { ...projectQuery, path: file }) : '',
        ]);
        setGit(status);
        setDiff(currentDiff);
      }
      setNotice({ push: 'Branch gönderildi.', commit: 'Commit oluşturuldu.', stage: 'Stage edildi.', 'stage-all': 'Tüm değişiklikler stage edildi.', unstage: 'Stage geri alındı.' }[route] || '');
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  const runRows = jobs.filter(job => tab === 'Ajanlar' ? Object.hasOwn(names, job.kind) : !Object.hasOwn(names, job.kind));
  const current = runRows.find(job => job.id === jobId) || runRows[0];
  const effectiveNotes = [...new Set([...(autoContext ? suggested : []), ...notes])];
  const browserAvailable = agents.some(item => item.id === agent && item.available);
  const staged = git?.files.filter(item => ![' ', '?', 'U', '!'].includes(item.code[0])).length || 0;
  function reviewChanges() {
    setPrompt('Bu çalışma ağacındaki staged ve unstaged değişiklikleri incele. Bulguları dosya ve satırla belirt. Dosyaları değiştirme.');
    setTab('Ajanlar');
  }
  return <main>
    <header className="project-head"><div><h1>{project.name}</h1><code title={project.root}>{project.root}</code></div>
      <div className="project-status">
        <button className="primary" onClick={() => setTab('Ajanlar')}>Yeni ajan görevi</button>
        <div className="branch">{git?.branch || 'HEAD'}{git?.ahead && git.ahead !== '0' ? <small>{git.ahead} gönderilmemiş</small> : null}</div>
      </div>
    </header>
    <div className="project-strip" aria-label="Proje durumu">
      <button onClick={() => setTab('Değişiklikler')}>Değişen <strong>{git?.files.length ?? '–'}</strong></button>
      <button onClick={() => setTab('Değişiklikler')}>Stage <strong>{git ? staged : '–'}</strong></button>
      <button onClick={() => setTab('Ajanlar')}>Çalışan ajan <strong>{jobs.filter(job => Object.hasOwn(names, job.kind) && job.status === 'Çalışıyor').length}</strong></button>
    </div>
    <div className="tabs" aria-label="Proje bölümleri">{tabs.map(label => <button key={label} aria-pressed={tab === label} onClick={() => { setTab(label); setError(''); setNotice(''); }}>{label}</button>)}</div>
    {error && <pre className="banner error" role="alert">{error}</pre>}
    {notice && <p className="banner" role="status">{notice}</p>}
    {tab === 'Değişiklikler' && <div className="split">
      <section className="changes">
        <div className="section-head"><h2>Dosyalar <small>{git?.files.length || 0}</small></h2>
          <div className="button-row">
            <button className="mini" disabled={!git?.files.length} onClick={reviewChanges}>İncelet</button>
            <button className="mini" disabled={busy || !git?.files.some(item => item.code[1] !== ' ')} onClick={() => act('stage-all')}>Tümünü stage et</button>
          </div>
        </div>
        <div className="file-list">
          {git?.files.map(item => <div className={'file-row ' + (file === item.path ? 'active' : '')} key={item.path}>
            <button title={item.path} onClick={() => { setFile(item.path); setDiff(''); }}><code>{item.code.replaceAll(' ', '·')}</code>{item.path}</button>
            {item.code[1] !== ' ' && <button className="mini" disabled={busy} onClick={() => act('stage', { path: item.path })}>Stage</button>}
            {![' ', '?'].includes(item.code[0]) && <button className="mini" disabled={busy} onClick={() => act('unstage', { path: item.path })}>Geri al</button>}
          </div>)}
          {!git?.files.length && <p className="muted">{git ? 'Çalışma ağacı temiz.' : 'Git durumu okunuyor…'}</p>}
        </div>
        <form className="commit" onSubmit={event => { event.preventDefault(); act('commit', { message }, () => setMessage('')); }}>
          <label htmlFor="commit">Commit mesajı</label>
          <textarea id="commit" rows="2" placeholder="Örn. API testlerini ekle" value={message} onChange={event => setMessage(event.target.value)} />
          <div className="button-row"><button className="primary" disabled={busy || !staged || !message.trim()}>Commit ({staged})</button>
          <button type="button" disabled={busy || !git?.branch} onClick={() => act('push')}>Push</button></div>
          <small>Hedef: {git?.upstream || (git?.branch ? 'origin/' + git.branch : '—')}</small>
        </form>
      </section>
      <section className="details">
        <form className="worktree" onSubmit={event => { event.preventDefault(); act('worktree', { branch }, onAdd); }}>
          <input aria-label="Yeni worktree branch adı" placeholder="feature/yeni-gorev" value={branch} onChange={event => setBranch(event.target.value)} />
          <button disabled={busy || !branch.trim()}>Worktree aç</button>
        </form>
        <div className="section-head"><h2>{file || 'Commit geçmişi'}</h2></div>
        {file ? <><button className="back" onClick={() => { setFile(null); setDiff(''); }}>Geçmişi göster</button><pre className="diff">{(diff || 'Bu dosya için diff yok.').split('\n').map((line, i) => <span key={i} className={line.startsWith('+') ? 'plus' : line.startsWith('-') ? 'minus' : line.startsWith('@@') ? 'hunk' : ''}>{line || ' '}</span>)}</pre></> :
          <div className="history">{git?.log ? git.log.split('\n').map(line => {
            const [hash, ...summary] = line.split('\t');
            return <div key={hash}><code>{hash}</code><span>{summary.join(' ')}</span></div>;
          }) : <p className="muted">Henüz commit yok.</p>}</div>}
      </section>
    </div>}
    {(tab === 'Ajanlar' || tab === 'Servisler') && <div className="split">
      <section className="changes">
        {tab === 'Ajanlar' ? <form className="panel-form" onSubmit={event => {
          event.preventDefault();
          act('agent-run', { agent, previous, notes: effectiveNotes, prompt: [prompt, handoff && 'Önceki çalışmanın özeti:\n' + handoff].filter(Boolean).join('\n\n') }, job => { setJobs(items => [job, ...items.filter(item => item.id !== job.id)]); setJobId(job.id); });
        }}>
          <h2>Ajan görevi</h2>
          <div className="agent-picker" aria-label="Ajan seç">{Object.entries(names).map(([id, name]) => <button type="button" key={id} aria-pressed={agent === id} onClick={() => setAgent(id)}><AgentIcon id={id} /><span>{name}<small>{agents.find(item => item.id === id)?.available ? 'Hazır' : 'CLI eksik'}</small></span></button>)}</div>
          <label>Görev<textarea rows="4" required value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
          <div className="task-presets">
            <button type="button" className="mini" onClick={reviewChanges}>Diff incele</button>
            <button type="button" className="mini" onClick={() => setPrompt('Değişen kod için ilgili testleri bul ve çalıştır. Sonuçları ve eksikleri raporla.')}>Testleri çalıştır</button>
          </div>
          <details className="handoff-fields"><summary>Görev devri{previous ? ' / seçili' : ''}</summary>
            <label>Önceki görev<select value={previous} onChange={event => setPrevious(event.target.value)}><option value="">Yeni görev</option>{runRows.filter(job => job.status !== 'Çalışıyor').map(job => <option key={job.id} value={job.id}>{names[job.kind]} / {job.request?.slice(0, 80) || job.status}</option>)}</select></label>
            <label>Devir notu<textarea rows="3" value={handoff} onChange={event => setHandoff(event.target.value)} placeholder="Kararlar, değişen dosyalar ve testler" /></label>
          </details>
          {noteOptions.length > 0 && <details className="note-picker"><summary>Göreve eklenen kayıtlar ({effectiveNotes.length}/8)</summary>
            {suggested.length > 0 && <label><input type="checkbox" checked={autoContext} onChange={event => { setAutoContext(event.target.checked); if (event.target.checked) setNotes(current => current.filter(id => !suggested.includes(id)).slice(0, 8 - suggested.length)); }} />Güncel bağlamı ve aktif planı otomatik ekle</label>}
            {noteOptions.map(item => <label key={item.id}><input type="checkbox" checked={effectiveNotes.includes(item.id)} disabled={(autoContext && suggested.includes(item.id)) || (effectiveNotes.length >= 8 && !effectiveNotes.includes(item.id))} onChange={event => {
              const checked = event.target.checked;
              setNotes(current => checked ? [...current, item.id] : current.filter(id => id !== item.id));
            }} /><span>{item.title}<small>{item.kind}</small></span></label>)}
          </details>}
          <button className="primary" disabled={busy || !browserAvailable}>Görevi başlat</button>
          {agent === 'cursor' && <small>Cursor bu sürümde inceleme modunda çalışır.</small>}
        </form> : <form className="panel-form" onSubmit={event => {
          event.preventDefault();
          const form = event.currentTarget;
          act('service-add', Object.fromEntries(new FormData(form)), item => { onUpdate(item); form.reset(); });
        }}>
          <h2>Servis ekle</h2>
          <label>Ad<input name="name" placeholder="Frontend" required /></label>
          <label>Çalışma klasörü<input name="cwd" placeholder="frontend" /></label>
          <label>Başlatma komutu<input name="command" placeholder="npm run dev" required /></label>
          <button className="primary" disabled={busy}>Servisi kaydet</button>
        </form>}
        {tab === 'Servisler' && project.services.map(service => <div className="service" key={service.id}><div><b>{service.name}</b><code>{service.command}</code></div><button disabled={busy} onClick={() => act('service-run', { id: service.id }, job => { setJobs(items => [job, ...items.filter(item => item.id !== job.id)]); setJobId(job.id); })}>Başlat</button></div>)}
      </section>
      <section className="details">
        <div className="section-head"><h2>Çalışma kayıtları</h2></div>
        <div className="run-list">{runRows.map(job => <button key={job.id} aria-pressed={job.id === current?.id} onClick={() => setJobId(job.id)}>{Object.hasOwn(names, job.kind) && <AgentIcon id={job.kind} />}{names[job.kind] || job.kind}<small>{job.status}</small></button>)}</div>
        {current ? <><div className="log-toolbar"><span>{new Date(current.started).toLocaleTimeString('tr-TR')}</span>{current.status === 'Çalışıyor' ? <button disabled={busy} onClick={() => act('stop', { id: current.id })}>Durdur</button> : tab === 'Ajanlar' && <button onClick={() => { setPrevious(current.id); setPrompt('Önceki görevden devam et.'); }}>Bu görevden devam et</button>}</div><pre className="terminal">{current.output || 'Çıktı bekleniyor…'}</pre></> : <p className="muted">Henüz çalışma kaydı yok.</p>}
      </section>
    </div>}
    {tab === 'Bağlam ve planlar' && <Notebook api={api} project={project.id} />}
    {tab === 'Yetenekler' && <div className="split">
      <form className="panel-form changes" onSubmit={event => {
        event.preventDefault();
        const form = event.currentTarget;
        act('skill-add', Object.fromEntries(new FormData(form)), async () => { setSkills(await api('skills', projectQuery)); form.reset(); });
      }}>
        <h2>Projeye skill ekle</h2>
        <label>Ajan<select name="agent">{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Skill adı<input name="name" placeholder="go-api-test" pattern="[a-z0-9]+(-[a-z0-9]+)*" required /></label>
        <label>Açıklama<input name="description" placeholder="Ne zaman kullanılır?" required /></label>
        <label>Talimatlar<textarea name="instructions" rows="6" required /></label>
        <button className="primary" disabled={busy}>SKILL.md oluştur</button>
      </form>
      <section className="details"><div className="section-head"><h2>Proje skill’leri</h2><span>{skills.length}</span></div>
        {skills.map(skill => <div key={skill.path} className="service"><div><b>{skill.name}</b><code>{skill.path}</code></div></div>)}
        {!skills.length && <p className="muted">Projede skill bulunamadı.</p>}
      </section>
    </div>}
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
