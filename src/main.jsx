import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { createRoot } from 'react-dom/client';
import { AudioLines, Check, ChevronDown, Clock3, CloudUpload, Download, FileAudio, FileVideo, Languages, ListMusic, LoaderCircle, Play, Plus, Settings2, ShieldCheck, Trash2, UploadCloud, X } from 'lucide-react';
import './styles.css';
import { authConfigured, registerAccount, confirmAccount, signIn, refreshSession, tokenExpired } from './auth.mjs';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/[/]+$/, '');

const REGION = import.meta.env.VITE_COGNITO_REGION || (import.meta.env.VITE_COGNITO_USER_POOL_ID || '').split('_')[0];
const USER_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';

export const authConfigured = Boolean(REGION && USER_POOL_ID && CLIENT_ID);

async function cognito(target, payload) {
  if (!authConfigured) throw new Error('ยังไม่ได้ตั้งค่า Cognito ในตัวแปร VITE_COGNITO_REGION, VITE_COGNITO_USER_POOL_ID และ VITE_COGNITO_CLIENT_ID');
  const response = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method:'POST',
    headers:{'content-type':'application/x-amz-json-1.1','x-amz-target':`AWSCognitoIdentityProviderService.${target}`},
    body:JSON.stringify(payload)
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.message || data.Message || 'Cognito request failed');
  return data;
}

export async function registerAccount(email, password) {
  return cognito('SignUp',{ClientId:CLIENT_ID,Username:email,Password:password,UserAttributes:[{Name:'email',Value:email}]});
}
export async function confirmAccount(email, code) {
  return cognito('ConfirmSignUp',{ClientId:CLIENT_ID,Username:email,ConfirmationCode:code});
}
export async function signIn(email, password) {
  const result = await cognito('InitiateAuth',{AuthFlow:'USER_PASSWORD_AUTH',ClientId:CLIENT_ID,AuthParameters:{USERNAME:email,PASSWORD:password}});
  if (!result.AuthenticationResult?.IdToken) throw new Error('เข้าสู่ระบบไม่สำเร็จ: ไม่ได้รับ ID token');
  return {idToken:result.AuthenticationResult.IdToken,accessToken:result.AuthenticationResult.AccessToken,refreshToken:result.AuthenticationResult.RefreshToken || ''};
}
export async function refreshSession(session) {
  if (!session?.refreshToken) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
  const result = await cognito('InitiateAuth',{AuthFlow:'REFRESH_TOKEN_AUTH',ClientId:CLIENT_ID,AuthParameters:{REFRESH_TOKEN:session.refreshToken}});
  if (!result.AuthenticationResult?.IdToken) throw new Error('ต่ออายุเซสชันไม่สำเร็จ');
  return {...session,idToken:result.AuthenticationResult.IdToken,accessToken:result.AuthenticationResult.AccessToken};
}
export function tokenExpired(token) {
  try { const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); return !payload.exp || payload.exp*1000 < Date.now()+60000; }
  catch { return true; }
}

function AuthPanel({onAuthenticated}) {
  const [mode,setMode]=useState('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [pendingConfirmation,setPendingConfirmation]=useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      if (pendingConfirmation) {
        await confirmAccount(email.trim(),code.trim());
        setPendingConfirmation(false); setMode('login'); setMessage('ยืนยันอีเมลสำเร็จ กรุณาเข้าสู่ระบบ');
      } else if (mode==='register') {
        const result=await registerAccount(email.trim(),password);
        if (result.UserConfirmed) { setMode('login'); setMessage('สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ'); }
        else { setPendingConfirmation(true); setMessage('ส่งรหัสยืนยันไปยังอีเมลแล้ว กรุณากรอกรหัส'); }
      } else {
        const session=await signIn(email.trim(),password);
        localStorage.setItem('aws-transcribe.session',JSON.stringify(session));
        onAuthenticated(session);
      }
    } catch(error) { setMessage(error.message || 'เกิดข้อผิดพลาด'); }
    finally { setBusy(false); }
  }
  return <main className="shell auth-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-icon"><AudioLines size={21}/></span><span>AWS <b>Transcribe</b><small>STUDIO</small></span></a></header>
    <section className="hero"><div className="eyebrow"><span className="live-dot"/> PRIVATE WORKSPACE</div><h1>เข้าสู่พื้นที่<br/><span>ทำงานส่วนตัว</span></h1><p>บัญชีผู้ใช้ช่วยแยกคิวงานและไฟล์ของแต่ละคน</p></section>
    <form className="auth-card" onSubmit={submit}>
      <div className="section-heading"><div><span className="eyebrow">ACCOUNT</span><h2>{pendingConfirmation?'ยืนยันอีเมล':mode==='register'?'สร้างบัญชี':'เข้าสู่ระบบ'}</h2></div></div>
      <label>อีเมล<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
      {!pendingConfirmation && <label>รหัสผ่าน<input type="password" autoComplete={mode==='register'?'new-password':'current-password'} minLength={10} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="อย่างน้อย 10 ตัวอักษร"/></label>}
      {pendingConfirmation && <label>รหัสยืนยัน<input inputMode="numeric" required value={code} onChange={e=>setCode(e.target.value)} placeholder="รหัสจากอีเมล"/></label>}
      <button className="primary-button auth-submit" disabled={busy || !authConfigured}>{busy?'กำลังดำเนินการ…':pendingConfirmation?'ยืนยันอีเมล':mode==='register'?'สมัครสมาชิก':'เข้าสู่ระบบ'}</button>
      {!authConfigured && <p className="auth-warning">ยังไม่ได้ตั้งค่า Cognito สำหรับเว็บ ต้องกำหนด VITE_COGNITO_REGION, VITE_COGNITO_USER_POOL_ID และ VITE_COGNITO_CLIENT_ID ก่อนใช้งานระบบบัญชี</p>}
      {message && <p className="auth-message" role="status">{message}</p>}
      {!pendingConfirmation && <button type="button" className="text-button auth-toggle" onClick={()=>{setMode(mode==='login'?'register':'login');setMessage('');}}>{mode==='login'?'ยังไม่มีบัญชี? สมัครสมาชิก':'มีบัญชีแล้ว? เข้าสู่ระบบ'}</button>}
    </form>
    <footer><div className="footer-mark"><ShieldCheck size={17}/> ระบบบัญชีและพื้นที่ส่วนตัว</div><span>ไม่เปิดเผยไฟล์งานต่อผู้ใช้อื่น</span></footer>
  </main>;
}


const mimeFor = (file) => file.type || ({mp3:'audio/mpeg',mp4:'video/mp4',m4a:'audio/mp4',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',webm:'video/webm'}[file.name.split('.').pop().toLowerCase()] || 'application/octet-stream');

const fmt = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;
const id = () => globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random());

function App() {
  const [session,setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('aws-transcribe.session') || 'null'); } catch { return null; } });
  const [jobs, setJobs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('aws-transcribe.jobs') || '[]');
      return Array.isArray(saved) ? saved.map(job => ({ ...job, file:null, downloads:{} })) : [];
    } catch {
      return [];
    }
  });
  const [language, setLanguage] = useState('auto');
  const [translate, setTranslate] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('เลือกไฟล์เสียงหรือวิดีโอเพื่อเริ่มต้น');
  const inputRef = useRef(null);

  async function authorizedHeaders(extra = {}) {
    if (!session?.idToken) throw new Error('กรุณาเข้าสู่ระบบก่อน');
    let active = session;
    if (tokenExpired(active.idToken)) {
      active = await refreshSession(active);
      setSession(active);
      localStorage.setItem('aws-transcribe.session',JSON.stringify(active));
    }
    return {...extra,Authorization:'Bearer '+active.idToken};
  }
  function logout() { localStorage.removeItem('aws-transcribe.session'); setSession(null); }

  useEffect(() => {
    try {
      const durableJobs = jobs.map(({ file, downloads, ...job }) => job);
      localStorage.setItem('aws-transcribe.jobs', JSON.stringify(durableJobs));
    } catch (error) {
      console.warn('Unable to persist local job history', error);
    }
  }, [jobs]);
  const counts = useMemo(() => ({
    all: jobs.length,
    queued: jobs.filter(j => j.status === 'รอคิว').length,
    done: jobs.filter(j => j.status === 'เสร็จแล้ว').length
  }), [jobs]);

  async function addFiles(fileList) {
    const accepted = Array.from(fileList || []).filter(f => ['.mp3','.mp4','.m4a','.wav','.flac','.ogg','.webm'].some(ext => f.name.toLowerCase().endsWith(ext)));
    if (!accepted.length) {
      setNotice('รองรับ MP3, MP4, M4A, WAV, FLAC, OGG และ WEBM');
      return;
    }
    if (!API_BASE) {
      setJobs(old => [...old, ...accepted.map(file => ({
        id: id(), file, name: file.name, size: fmt(file.size), status: 'รอเชื่อม AWS API', progress: 0
      }))]);
      setNotice('เพิ่มไฟล์ในหน้าจอแล้ว แต่ยังไม่ได้เชื่อม AWS API — ยังไม่มีการอัปโหลดหรือถอดเสียงจริง');
      return;
    }
    for (const file of accepted) {
      const localId = id();
      const contentType = mimeFor(file);
      setJobs(old => [...old, { id:localId, file, name:file.name, size:fmt(file.size), status:'กำลังอัปโหลด', progress:10 }]);
      try {
        const uploadResponse = await fetch(`${API_BASE}/uploads`, {
          method:'POST', headers:await authorizedHeaders({'content-type':'application/json'}),
          body:JSON.stringify({ fileName:file.name, contentType, size:file.size })
        });
        if (!uploadResponse.ok) throw new Error((await uploadResponse.json()).error || 'ขอ URL อัปโหลดไม่สำเร็จ');
        const upload = await uploadResponse.json();
        setJobs(old => old.map(j => j.id === localId ? {...j,progress:35,status:'กำลังส่งไฟล์ไป S3'} : j));
        const putResponse = await fetch(upload.uploadUrl, { method:'PUT', headers:{'content-type':contentType}, body:file });
        if (!putResponse.ok) throw new Error('อัปโหลดไป S3 ไม่สำเร็จ');
        const jobResponse = await fetch(`${API_BASE}/jobs`, {
          method:'POST', headers:await authorizedHeaders({'content-type':'application/json'}),
          body:JSON.stringify({ jobId:upload.jobId, key:upload.key, fileName:file.name, sourceLanguage:language, translateToThai:translate })
        });
        if (!jobResponse.ok) throw new Error((await jobResponse.json()).error || 'ส่งงานเข้าคิวไม่สำเร็จ');
        setJobs(old => old.map(j => j.id === localId ? {...j,progress:100,status:'รอคิว AWS',serverJobId:upload.jobId} : j));
        setNotice(`อัปโหลด ${file.name} สำเร็จและส่งเข้าคิว AWS แล้ว`);
      } catch (error) {
        setJobs(old => old.map(j => j.id === localId ? {...j,status:'อัปโหลดไม่สำเร็จ',error:String(error.message || error)} : j));
        setNotice(`ไม่สามารถส่ง ${file.name} ได้: ${error.message || error}`);
      }
    }
  }

  useEffect(() => {
    if (!API_BASE) return;
    const timer = setInterval(async () => {
      const pending = jobs.filter(job => job.serverJobId && !['เสร็จแล้ว','ล้มเหลว'].includes(job.status));
      for (const job of pending) {
        try {
          const response = await fetch(API_BASE + '/jobs/' + job.serverJobId,{headers:await authorizedHeaders()});
          if (!response.ok) continue;
          const remote = await response.json();
          const status = remote.status === 'COMPLETED' ? 'เสร็จแล้ว' : remote.status === 'FAILED' ? 'ล้มเหลว' : remote.status === 'TRANSCRIBING' ? 'กำลังถอดเสียง' : remote.status === 'QUEUED' ? 'รอคิว AWS' : remote.status;
          setJobs(old => old.map(item => item.id === job.id ? {...item, status, downloads:remote.downloads || {}, error:remote.errorMessage || item.error} : item));
        } catch (error) { console.warn('Job status refresh failed', error); }
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [jobs]);

  async function downloadZip(job) {
    try {
      const zip = new JSZip();
      const entries = [['original.srt', job.downloads?.original], ['thai.srt', job.downloads?.thai]].filter(([,url]) => Boolean(url));
      if (!entries.length) throw new Error('ยังไม่มีไฟล์ดาวน์โหลด');
      for (const [name,url] of entries) { const response = await fetch(url); if (!response.ok) throw new Error('ดาวน์โหลด ' + name + ' ไม่สำเร็จ'); zip.file(name, await response.text()); }
      const blob = await zip.generateAsync({type:'blob'});
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = job.name.replace(/\.[^.]+$/, '') + '-subtitles.zip'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setNotice('สร้าง ZIP ไม่สำเร็จ: ' + (error.message || error)); }
  }
  function removeJob(jobId) {
    setJobs(old => old.filter(j => j.id !== jobId));
  }

  function clearDone() {
    setJobs(old => old.filter(j => j.status !== 'เสร็จแล้ว'));
  }

  if (!session?.idToken) return <AuthPanel onAuthenticated={setSession}/>;

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-icon"><AudioLines size={21}/></span><span>AWS <b>Transcribe</b><small>STUDIO</small></span></a>
      <div className="top-actions"><button className="icon-button" aria-label="ไปยังการตั้งค่างาน" onClick={() => document.getElementById("job-settings")?.scrollIntoView({behavior:"smooth",block:"center"})}><Settings2 size={19}/></button><button className="text-button logout-button" onClick={logout}>ออกจากระบบ</button></div>
    </header>

    <section className="hero">
      <div className="eyebrow"><span className="live-dot"/> AUDIO WORKSPACE</div>
      <h1>เปลี่ยนเสียงพูด<br/><span>เป็นซับไตเติล</span></h1>
      <p>ถอดเสียง แปลภาษา และสร้างไฟล์ SRT ในพื้นที่ทำงานเดียว</p>
      <div className="feature-pills"><span><ShieldCheck size={14}/> จัดเก็บแบบส่วนตัว</span><span><Languages size={14}/> แปลเป็นไทย</span><span><ListMusic size={14}/> รองรับหลายไฟล์</span></div>
    </section>

    <section className={`upload-card ${dragging ? 'dragging' : ''}`}
      onDragOver={e => {e.preventDefault();setDragging(true);}}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {e.preventDefault();setDragging(false);addFiles(e.dataTransfer.files);}}>
      <input ref={inputRef} type="file" accept=".mp3,.mp4,.m4a,.wav,.flac,.ogg,.webm,audio/*,video/*" multiple hidden onChange={e => {addFiles(e.target.files);e.target.value='';}}/>
      <div className="upload-icon"><CloudUpload size={28}/></div>
      <h2>อัปโหลดไฟล์ของคุณ</h2>
      <p>ลากไฟล์มาวางที่นี่ หรือเลือกจากอุปกรณ์</p>
      <button className="primary-button" onClick={() => inputRef.current?.click()}><Plus size={18}/> เลือกไฟล์</button>
      <div className="file-types"><span><FileAudio size={14}/> MP3 / WAV / M4A</span><span><FileVideo size={14}/> MP4 / WEBM</span></div>
    </section>

    <section className="settings-card" id="job-settings">
      <div className="section-heading"><div><span className="eyebrow">JOB SETTINGS</span><h2>การตั้งค่างาน</h2></div><span className="settings-tag"><Settings2 size={14}/> ปรับได้</span></div>
      <div className="setting-row"><div><b>ภาษาต้นฉบับ</b><small>ตรวจจับภาษาอัตโนมัติหรือเลือกเอง</small></div>
        <div className="select-wrap"><select value={language} onChange={e=>setLanguage(e.target.value)}><option value="auto">Auto Detect</option><option value="ja">Japanese</option><option value="zh">Chinese</option><option value="en">English</option><option value="ko">Korean</option><option value="th">Thai</option></select><ChevronDown size={15}/></div>
      </div>
      <div className="setting-row"><div><b>แปลเป็นภาษาไทย</b><small>เก็บต้นฉบับและคำแปลแยกกัน</small></div><button className={`switch ${translate?'on':''}`} onClick={()=>setTranslate(v=>!v)} aria-label="สลับการแปล"><span/></button></div>
      <div className="adult-note"><ShieldCheck size={17}/><span><b>รองรับบทสนทนา 18+ ที่ถูกกฎหมาย</b><small>ไม่เพิ่มตัวกรองเซ็นเซอร์คำหยาบหรือบทสนทนาผู้ใหญ่ในตัวแอป ทั้งนี้ยังขึ้นกับข้อกำหนดของบริการแปลที่เลือกใช้</small></span></div>
    </section>

    <section className="queue-section">
      <div className="section-heading"><div><span className="eyebrow">PROCESSING QUEUE</span><h2>คิวประมวลผล <span className="count">{counts.all}</span></h2></div><button className="text-button" onClick={clearDone} disabled={!counts.done}>ล้างงานที่เสร็จ</button></div>
      {jobs.length === 0 ? <div className="empty-state"><div className="empty-icon"><ListMusic size={23}/></div><b>ยังไม่มีไฟล์ในคิว</b><span>ไฟล์ที่คุณเลือกจะแสดงที่นี่</span></div> :
        <div className="job-list">{jobs.map(job=><article className="job" key={job.id}><div className="job-file-icon">{/\.(mp4|webm)$/i.test(job.name)?<FileVideo size={19}/>:<FileAudio size={19}/>}</div><div className="job-info"><b title={job.name}>{job.name}</b><small>{job.size} · {job.status}</small>{job.error ? ` · ${job.error}` : ''}{job.status==='เสร็จแล้ว'&&<div className="job-downloads"><button className="text-button" onClick={()=>downloadZip(job)}><Download size={13}/> ดาวน์โหลด SRT + ZIP</button>{job.downloads?.original&&<a href={job.downloads.original} target="_blank" rel="noreferrer">Original SRT</a>}{job.downloads?.thai&&<a href={job.downloads.thai} target="_blank" rel="noreferrer">Thai SRT</a>}</div>}{job.status==='กำลังประมวลผล'&&<div className="progress"><span style={{width:`${job.progress}%`}}/></div>}</div><button className="icon-button subtle" onClick={()=>removeJob(job.id)} aria-label="ลบไฟล์"><Trash2 size={16}/></button></article>)}</div>}
    </section>

    <footer><div className="footer-mark"><AudioLines size={17}/> AWS Transcribe Studio</div><span>Web workspace · Mobile ready</span><p>{notice}</p></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
