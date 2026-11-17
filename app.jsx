import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const names = { codex: 'Codex', claude: 'Claude Code', cursor: 'Cursor Agent' };
const tabs = ['Değişiklikler', 'Ajanlar', 'Servisler', 'Yetenekler'];
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
  useEffect(() => {
    Promise.all([api('projects'), api('agents')]).then(([items, available]) => {
      setProjects(items);
      setSelected(current => items.some(item => item.id === current) ? current : items[0]?.id || '');
      setAgents(available);
    }).catch(error => setError(error.message));
  }, []);
  const project = projects.find(item => item.id === selected);
  function select(id) {
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
      <header className="brand"><span className="mark" aria-hidden="true">AW</span><div>Agent Workspace<small>Yerel çalışma alanı</small></div></header>
      <nav aria-label="Projeler">
        <h2>Projeler</h2>
        {projects.map(item => <button key={item.id} className={item.id === selected ? 'selected' : ''} onClick={() => select(item.id)} title={item.root}>{item.name}</button>)}
      </nav>
      <form onSubmit={add} className="add">
        <label htmlFor="repo">Git repo klasörü</label>
        <input id="repo" value={path} onChange={event => setPath(event.target.value)} placeholder="C:\\projeler\\uygulama" required />
        <button>Projeyi ekle</button>
        {error && <p role="alert" className="error">{error}</p>}
      </form>
      <div className="availability">
        {agents.map(({ id, available }) => <div key={id}><span className={available ? 'dot ready' : 'dot'}></span>{names[id]}<small>{available ? 'CLI bulundu' : 'CLI eksik'}</small></div>)}
      </div>
    </aside>
    {project ? <Project onAdd={item => { setProjects(current => [...current, item]); select(item.id); }} key={project.id} project={project} agents={agents} onUpdate={item => setProjects(current => current.map(old => old.id === item.id ? item : old))} />
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
  const projectQuery = { project: project.id };
  useEffect(() => {
    let active = true;
    let timer;
    async function refresh() {
      try {
        const [status, runs, currentDiff] = await Promise.all([
          api('status', { project: project.id }), api('jobs', { project: project.id }),
          file ? api('diff', { project: project.id, path: file }) : '',
        ]);
        if (active) { setGit(status); setJobs(runs); setDiff(currentDiff); }
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
      if (['stage', 'unstage', 'commit', 'push'].includes(route)) {
        const [status, currentDiff] = await Promise.all([
          api('status', projectQuery),
          file ? api('diff', { ...projectQuery, path: file }) : '',
        ]);
        setGit(status);
        setDiff(currentDiff);
      }
      setNotice({ push: 'Branch gönderildi.', commit: 'Commit oluşturuldu.', stage: 'Stage edildi.', unstage: 'Stage geri alındı.' }[route] || '');
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  const runRows = jobs.filter(job => tab === 'Ajanlar' ? Object.hasOwn(names, job.kind) : !Object.hasOwn(names, job.kind));
  const current = runRows.find(job => job.id === jobId) || runRows[0];
  const browserAvailable = agents.some(item => item.id === agent && item.available);
  const staged = git?.files.filter(item => ![' ', '?', 'U', '!'].includes(item.code[0])).length || 0;
  return <main>
    <header className="project-head"><div><h1>{project.name}</h1><code title={project.root}>{project.root}</code></div>
      <div className="branch"><span className="dot ready"></span>{git?.branch || 'HEAD'}{git?.ahead && git.ahead !== '0' ? <small>{git.ahead} gönderilmemiş</small> : null}</div>
    </header>
    <div className="tabs" aria-label="Proje bölümleri">{tabs.map(label => <button key={label} aria-pressed={tab === label} onClick={() => { setTab(label); setError(''); setNotice(''); }}>{label}</button>)}</div>
    {error && <pre className="banner error" role="alert">{error}</pre>}
    {notice && <p className="banner" role="status">{notice}</p>}
    {tab === 'Değişiklikler' && <div className="split">
      <section className="changes">
        <div className="section-head"><h2>Dosyalar</h2><span>{git?.files.length || 0}</span></div>
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
        {file ? <><button className="back" onClick={() => { setFile(''); setDiff(''); }}>Geçmişi göster</button><pre className="diff">{(diff || 'Bu dosya için diff yok.').split('\n').map((line, i) => <span key={i} className={line.startsWith('+') ? 'plus' : line.startsWith('-') ? 'minus' : line.startsWith('@@') ? 'hunk' : ''}>{line}{'\n'}</span>)}</pre></> :
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
          act('agent-run', { agent, previous, prompt: [prompt, handoff && 'Önceki çalışmanın özeti:\n' + handoff].filter(Boolean).join('\n\n') }, job => { setJobs(items => [job, ...items.filter(item => item.id !== job.id)]); setJobId(job.id); });
        }}>
          <h2>Ajan görevi</h2>
          <label>Ajan<select value={agent} onChange={event => setAgent(event.target.value)}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}{agents.find(item => item.id === id)?.available ? '' : ' · CLI eksik'}</option>)}</select></label>
          <label>Görev<textarea rows="4" required value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
          <label>Önceki görev<select value={previous} onChange={event => setPrevious(event.target.value)}><option value="">Yeni görev</option>{runRows.filter(job => job.status !== 'Çalışıyor').map(job => <option key={job.id} value={job.id}>{names[job.kind]} · {job.request?.slice(0, 80) || job.status}</option>)}</select></label>
          <label>Devir notu<textarea rows="3" value={handoff} onChange={event => setHandoff(event.target.value)} placeholder="Kararlar, değişen dosyalar ve testler" /></label>
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
        <div className="run-list">{runRows.map(job => <button key={job.id} aria-pressed={job.id === current?.id} onClick={() => setJobId(job.id)}>{names[job.kind] || job.kind}<small>{job.status}</small></button>)}</div>
        {current ? <><div className="log-toolbar"><span>{new Date(current.started).toLocaleTimeString('tr-TR')}</span>{current.status === 'Çalışıyor' && <button disabled={busy} onClick={() => act('stop', { id: current.id })}>Durdur</button>}</div><pre className="terminal">{current.output || 'Çıktı bekleniyor…'}</pre></> : <p className="muted">Henüz çalışma kaydı yok.</p>}
      </section>
    </div>}
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
