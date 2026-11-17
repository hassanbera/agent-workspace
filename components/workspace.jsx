'use client';

import React, { useEffect, useState } from 'react';
import { Notebook } from './notebook';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { BookOpen, FolderOpen, GitBranch, Plus, Terminal } from 'lucide-react';
const codexIcon = '/brands/codex-color.svg';
const claudeIcon = '/brands/claude-color.svg';
const cursorIcon = '/brands/cursor.svg';

const names = { codex: 'Codex', claude: 'Claude Code', cursor: 'Cursor Agent' };
const icons = { codex: codexIcon, claude: claudeIcon, cursor: cursorIcon };
const palettes = [
  { id: 'studio', title: 'Stüdyo / Limon' },
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
export default function Workspace() {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState('');
  const [agents, setAgents] = useState([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [archive, setArchive] = useState(false);
  const [palette, setPalette] = useState(null);
  useEffect(() => {
    if (!palette) return;
    document.documentElement.dataset.palette = palette;
    localStorage.setItem('workspace.palette.next', palette);
  }, [palette]);
  useEffect(() => {
    const storedProject = localStorage.getItem('workspace.project');
    const storedPalette = localStorage.getItem('workspace.palette.next');
    setPalette(palettes.some(item => item.id === storedPalette) ? storedPalette : 'studio');
    Promise.all([api('projects'), api('agents')]).then(([items, available]) => {
      setProjects(items);
      setSelected(items.some(item => item.id === storedProject) ? storedProject : items[0]?.id || '');
      setAgents(available);
    }).catch(error => setError(error.message));
  }, []);
  const project = projects.find(item => item.id === selected);
  function select(id) {
    setArchive(false);
    localStorage.setItem('workspace.project', id);
    setSelected(id);
  }
  async function openProject() {
    if (picking) return;
    setPicking(true);
    setError('');
    try {
      const item = await api('pick-project', {}, {});
      if (!item) return;
      setProjects(current => current.some(project => project.id === item.id) ? current : [...current, item]);
      select(item.id);
    } catch (error) { setError(error.message); }
    finally { setPicking(false); }
  }
  return <div className="shell">
    <aside className="rail">
      <header className="brand"><span className="brand-sign"><Terminal size={18} aria-hidden="true" /></span>Agent Workspace</header>
      <Button variant="ghost" className={'archive-link ' + (archive ? 'selected' : '')} aria-pressed={archive} onClick={() => setArchive(true)}><BookOpen size={16} />Bilgi arşivi</Button>
      <nav aria-label="Projeler">
        <h2>Projeler</h2>
        {projects.map(item => <Button variant="ghost" key={item.id} className={!archive && item.id === selected ? 'selected' : ''} onClick={() => select(item.id)} title={item.root}>{item.name}</Button>)}
      </nav>
      <div className="add">
        <Button variant="outline" disabled={picking} onClick={openProject}><FolderOpen size={16} />{picking ? 'Klasör seçici açık…' : 'Proje aç'}</Button>
        {error && <p role="alert" className="error">{error}</p>}
      </div>
      <div className="availability">
        {agents.map(({ id, available }) => <div key={id}><AgentIcon id={id} />{names[id]}<small>{available ? 'Hazır' : 'CLI eksik'}</small></div>)}
        <details className="palettes"><summary>Renk paleti</summary>
          {palettes.map(item => <Button variant="ghost" key={item.id} aria-pressed={palette === item.id} onClick={() => setPalette(item.id)}>
            {item.title}
          </Button>)}
        </details>
      </div>
    </aside>
    {archive ? <main className="archive-page"><header className="project-head"><h1>Geliştirici bilgi arşivi</h1></header><Notebook api={api} /></main> : project ? <Project onAdd={item => { setProjects(current => [...current, item]); select(item.id); }} key={project.id} project={project} agents={agents} onUpdate={item => setProjects(current => current.map(old => old.id === item.id ? item : old))} />
      : <main className="empty"><h1>Bir proje aç</h1><p>Windows klasör seçicisinden Git projeni seç.</p><Button disabled={picking} onClick={openProject}><FolderOpen size={16} />{picking ? 'Klasör seçici açık…' : 'Klasör seç'}</Button></main>}
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
        <Button variant="default" onClick={() => setTab('Ajanlar')}><Plus size={16} />Yeni ajan görevi</Button>
        <Badge variant="outline" className="branch"><GitBranch size={14} />{git?.branch || 'HEAD'}{git?.ahead && git.ahead !== '0' ? <small>{git.ahead} gönderilmemiş</small> : null}</Badge>
      </div>
    </header>
    <div className="project-strip" aria-label="Proje durumu">
      <Button variant="outline" size="sm" onClick={() => setTab('Değişiklikler')}>Değişen <strong>{git?.files.length ?? '–'}</strong></Button>
      <Button variant="outline" size="sm" onClick={() => setTab('Değişiklikler')}>Stage <strong>{git ? staged : '–'}</strong></Button>
      <Button variant="outline" size="sm" onClick={() => setTab('Ajanlar')}>Çalışan ajan <strong>{jobs.filter(job => Object.hasOwn(names, job.kind) && job.status === 'Çalışıyor').length}</strong></Button>
    </div>
    <div className="tabs" aria-label="Proje bölümleri">{tabs.map(label => <Button variant="ghost" key={label} aria-pressed={tab === label} onClick={() => { setTab(label); setError(''); setNotice(''); }}>{label}</Button>)}</div>
    {error && <pre className="banner error" role="alert">{error}</pre>}
    {notice && <p className="banner" role="status">{notice}</p>}
    {tab === 'Değişiklikler' && <div className="split">
      <section className="changes">
        <div className="section-head"><h2>Dosyalar <small>{git?.files.length || 0}</small></h2>
          <div className="button-row">
            <Button variant="outline" className="mini" disabled={!git?.files.length} onClick={reviewChanges}>İncelet</Button>
            <Button variant="outline" className="mini" disabled={busy || !git?.files.some(item => item.code[1] !== ' ')} onClick={() => act('stage-all')}>Tümünü stage et</Button>
          </div>
        </div>
        <div className="file-list">
          {git?.files.map(item => <div className={'file-row ' + (file === item.path ? 'active' : '')} key={item.path}>
            <Button variant="ghost" title={item.path} onClick={() => { setFile(item.path); setDiff(''); }}><code>{item.code.replaceAll(' ', '·')}</code>{item.path}</Button>
            {item.code[1] !== ' ' && <Button variant="outline" className="mini" disabled={busy} onClick={() => act('stage', { path: item.path })}>Stage</Button>}
            {![' ', '?'].includes(item.code[0]) && <Button variant="outline" className="mini" disabled={busy} onClick={() => act('unstage', { path: item.path })}>Geri al</Button>}
          </div>)}
          {!git?.files.length && <p className="muted">{git ? 'Çalışma ağacı temiz.' : 'Git durumu okunuyor…'}</p>}
        </div>
        <form className="commit" onSubmit={event => { event.preventDefault(); act('commit', { message }, () => setMessage('')); }}>
          <label htmlFor="commit">Commit mesajı</label>
          <Textarea id="commit" rows="2" placeholder="Örn. API testlerini ekle" value={message} onChange={event => setMessage(event.target.value)} />
          <div className="button-row"><Button variant="default" disabled={busy || !staged || !message.trim()}>Commit ({staged})</Button>
          <Button type="button" variant="outline" disabled={busy || !git?.branch} onClick={() => act('push')}>Push</Button></div>
          <small>Hedef: {git?.upstream || (git?.branch ? 'origin/' + git.branch : '—')}</small>
        </form>
      </section>
      <section className="details">
        <details className="worktree"><summary>Worktree aç</summary><form onSubmit={event => { event.preventDefault(); act('worktree', { branch }, onAdd); }}>
          <Input aria-label="Yeni worktree branch adı" placeholder="feature/yeni-gorev" value={branch} onChange={event => setBranch(event.target.value)} />
          <Button disabled={busy || !branch.trim()}>Oluştur</Button>
        </form></details>
        <div className="section-head"><h2>{file || 'Commit geçmişi'}</h2></div>
        {file ? <><Button variant="ghost" className="back" onClick={() => { setFile(null); setDiff(''); }}>Geçmişi göster</Button><pre className="diff">{(diff || 'Bu dosya için diff yok.').split('\n').map((line, i) => <span key={i} className={line.startsWith('+') ? 'plus' : line.startsWith('-') ? 'minus' : line.startsWith('@@') ? 'hunk' : ''}>{line || ' '}</span>)}</pre></> :
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
          <div className="agent-picker" aria-label="Ajan seç">{Object.entries(names).map(([id, name]) => <Button variant="ghost" type="button" key={id} aria-pressed={agent === id} onClick={() => setAgent(id)}><AgentIcon id={id} /><span>{name}<small>{agents.find(item => item.id === id)?.available ? 'Hazır' : 'CLI eksik'}</small></span></Button>)}</div>
          <label>Görev<Textarea rows="4" required value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
          <div className="task-presets">
            <Button type="button" variant="outline" className="mini" onClick={reviewChanges}>Diff incele</Button>
            <Button type="button" variant="outline" className="mini" onClick={() => setPrompt('Değişen kod için ilgili testleri bul ve çalıştır. Sonuçları ve eksikleri raporla.')}>Testleri çalıştır</Button>
          </div>
          <details className="handoff-fields"><summary>Görev devri{previous ? ' / seçili' : ''}</summary>
            <label>Önceki görev<select value={previous} onChange={event => setPrevious(event.target.value)}><option value="">Yeni görev</option>{runRows.filter(job => job.status !== 'Çalışıyor').map(job => <option key={job.id} value={job.id}>{names[job.kind]} / {job.request?.slice(0, 80) || job.status}</option>)}</select></label>
            <label>Devir notu<Textarea rows="3" value={handoff} onChange={event => setHandoff(event.target.value)} placeholder="Kararlar, değişen dosyalar ve testler" /></label>
          </details>
          {noteOptions.length > 0 && <details className="note-picker"><summary>Göreve eklenen kayıtlar ({effectiveNotes.length}/8)</summary>
            {suggested.length > 0 && <label><input type="checkbox" checked={autoContext} onChange={event => { setAutoContext(event.target.checked); if (event.target.checked) setNotes(current => current.filter(id => !suggested.includes(id)).slice(0, 8 - suggested.length)); }} />Güncel bağlamı ve aktif planı otomatik ekle</label>}
            {noteOptions.map(item => <label key={item.id}><input type="checkbox" checked={effectiveNotes.includes(item.id)} disabled={(autoContext && suggested.includes(item.id)) || (effectiveNotes.length >= 8 && !effectiveNotes.includes(item.id))} onChange={event => {
              const checked = event.target.checked;
              setNotes(current => checked ? [...current, item.id] : current.filter(id => id !== item.id));
            }} /><span>{item.title}<small>{item.kind}</small></span></label>)}
          </details>}
          <Button variant="default" disabled={busy || !browserAvailable}>Görevi başlat</Button>
          {agent === 'cursor' && <small>Cursor bu sürümde inceleme modunda çalışır.</small>}
        </form> : <form className="panel-form" onSubmit={event => {
          event.preventDefault();
          const form = event.currentTarget;
          act('service-add', Object.fromEntries(new FormData(form)), item => { onUpdate(item); form.reset(); });
        }}>
          <h2>Servis ekle</h2>
          <label>Ad<Input name="name" placeholder="Frontend" required /></label>
          <label>Çalışma klasörü<Input name="cwd" placeholder="frontend" /></label>
          <label>Başlatma komutu<Input name="command" placeholder="npm run dev" required /></label>
          <Button variant="default" disabled={busy}>Servisi kaydet</Button>
        </form>}
        {tab === 'Servisler' && project.services.map(service => <div className="service" key={service.id}><div><b>{service.name}</b><code>{service.command}</code></div><Button disabled={busy} onClick={() => act('service-run', { id: service.id }, job => { setJobs(items => [job, ...items.filter(item => item.id !== job.id)]); setJobId(job.id); })}>Başlat</Button></div>)}
      </section>
      <section className="details">
        <div className="section-head"><h2>Çalışma kayıtları</h2></div>
        <div className="run-list">{runRows.map(job => <Button variant="ghost" key={job.id} aria-pressed={job.id === current?.id} onClick={() => setJobId(job.id)}>{Object.hasOwn(names, job.kind) && <AgentIcon id={job.kind} />}{names[job.kind] || job.kind}<small>{job.status}</small></Button>)}</div>
        {current ? <><div className="log-toolbar"><span>{new Date(current.started).toLocaleTimeString('tr-TR')}</span>{current.status === 'Çalışıyor' ? <Button disabled={busy} onClick={() => act('stop', { id: current.id })}>Durdur</Button> : tab === 'Ajanlar' && <Button onClick={() => { setPrevious(current.id); setPrompt('Önceki görevden devam et.'); }}>Bu görevden devam et</Button>}</div><pre className="terminal">{current.output || 'Çıktı bekleniyor…'}</pre></> : <p className="muted">Henüz çalışma kaydı yok.</p>}
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
        <label>Skill adı<Input name="name" placeholder="go-api-test" pattern="[a-z0-9]+(-[a-z0-9]+)*" required /></label>
        <label>Açıklama<Input name="description" placeholder="Ne zaman kullanılır?" required /></label>
        <label>Talimatlar<Textarea name="instructions" rows="6" required /></label>
        <Button variant="default" disabled={busy}>SKILL.md oluştur</Button>
      </form>
      <section className="details"><div className="section-head"><h2>Proje skill’leri</h2><span>{skills.length}</span></div>
        {skills.map(skill => <div key={skill.path} className="service"><div><b>{skill.name}</b><code>{skill.path}</code></div></div>)}
        {!skills.length && <p className="muted">Projede skill bulunamadı.</p>}
      </section>
    </div>}
  </main>;
}
