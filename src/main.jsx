import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioLines, Check, ChevronDown, Clock3, CloudUpload, Download, FileAudio, FileVideo, Languages, ListMusic, LoaderCircle, Play, Plus, Settings2, ShieldCheck, Trash2, UploadCloud, X } from 'lucide-react';
import './styles.css';
import { Amplify } from 'aws-amplify';
import { signIn, confirmSignIn, signOut, fetchAuthSession } from 'aws-amplify/auth';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/[/]+$/, '');
const COGNITO_POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
const AUTH_CONFIGURED = Boolean(COGNITO_POOL_ID && COGNITO_CLIENT_ID);
if (AUTH_CONFIGURED) Amplify.configure({ Auth: { Cognito: { userPoolId: COGNITO_POOL_ID, userPoolClientId: COGNITO_CLIENT_ID, loginWith: { email: true } } } });
async function bearerHeaders() {
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return { authorization: `Bearer ${token}` };
}
const mimeFor = (file) => file.type || ({mp3:'audio/mpeg',mp4:'video/mp4',m4a:'audio/mp4',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',webm:'video/webm'}[file.name.split('.').pop().toLowerCase()] || 'application/octet-stream');

const fmt = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;
const id = () => globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random());

function App() {
  const [jobs, setJobs] = useState([]);
  const [signedIn, setSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [language, setLanguage] = useState('auto');
  const [translate, setTranslate] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('เลือกไฟล์เสียงหรือวิดีโอเพื่อเริ่มต้น');
  const inputRef = useRef(null);
  useEffect(() => {
    let active = true;
    if (!AUTH_CONFIGURED) { setAuthReady(true); return undefined; }
    fetchAuthSession().then(session => { if (active) setSignedIn(Boolean(session.tokens?.accessToken)); }).catch(() => {}).finally(() => { if (active) setAuthReady(true); });
    return () => { active = false; };
  }, []);

  async function handleSignIn(event) {
    event.preventDefault(); setAuthMessage('');
    try {
      const result = await signIn({ username:email.trim(), password });
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') { setNeedsNewPassword(true); setAuthMessage('บัญชีนี้ต้องตั้งรหัสผ่านใหม่ก่อนใช้งาน'); return; }
      if (result.isSignedIn) setSignedIn(true);
      else setAuthMessage('ระบบต้องการขั้นตอนยืนยันเพิ่มเติม กรุณาติดต่อผู้ดูแลระบบ');
    } catch (error) { setAuthMessage(error.message || 'เข้าสู่ระบบไม่สำเร็จ'); }
  }

  async function handleNewPassword(event) {
    event.preventDefault(); setAuthMessage('');
    try {
      const result = await confirmSignIn({ challengeResponse:newPassword });
      if (result.isSignedIn) { setNeedsNewPassword(false); setSignedIn(true); setPassword(''); setNewPassword(''); }
      else setAuthMessage('ยังตั้งรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง');
    } catch (error) { setAuthMessage(error.message || 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ'); }
  }

  async function handleSignOut() {
    await signOut(); setSignedIn(false); setJobs([]); setPassword('');
  }

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
        const authHeaders = await bearerHeaders();
        const uploadResponse = await fetch(`${API_BASE}/uploads`, {
          method:'POST', headers:{'content-type':'application/json', ...authHeaders},
          body:JSON.stringify({ fileName:file.name, contentType, size:file.size })
        });
        if (!uploadResponse.ok) throw new Error((await uploadResponse.json()).error || 'ขอ URL อัปโหลดไม่สำเร็จ');
        const upload = await uploadResponse.json();
        setJobs(old => old.map(j => j.id === localId ? {...j,progress:35,status:'กำลังส่งไฟล์ไป S3'} : j));
        const putResponse = await fetch(upload.uploadUrl, { method:'PUT', headers:{'content-type':contentType}, body:file });
        if (!putResponse.ok) throw new Error('อัปโหลดไป S3 ไม่สำเร็จ');
        const jobResponse = await fetch(`${API_BASE}/jobs`, {
          method:'POST', headers:{'content-type':'application/json', ...authHeaders},
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

  const pollKey = jobs.filter(job => job.serverJobId && !['COMPLETED','FAILED'].includes(job.serverStatus)).map(job => job.serverJobId).join(',');

  useEffect(() => {
    const pending = jobs.filter(job => job.serverJobId && !['COMPLETED','FAILED'].includes(job.serverStatus));
    if (!pending.length || !API_BASE) return undefined;
    let cancelled = false;
    const poll = async () => {
      await Promise.all(pending.map(async job => {
        try {
          const response = await fetch(`${API_BASE}/jobs/${job.serverJobId}`, { headers:await bearerHeaders() });
          if (!response.ok) return;
          const serverJob = await response.json();
          if (cancelled) return;
          const labels = { QUEUED:'รอคิว AWS', TRANSCRIBING:'กำลังถอดเสียง', PROCESSING:'กำลังเตรียมคำบรรยาย', COMPLETED:'เสร็จแล้ว', FAILED:'เกิดข้อผิดพลาด' };
          setJobs(old => old.map(item => item.id === job.id ? {
            ...item,
            status:labels[serverJob.status] || item.status,
            serverStatus:serverJob.status,
            error:serverJob.errorMessage || item.error,
            originalDownloadUrl:serverJob.originalDownloadUrl,
            thaiDownloadUrl:serverJob.thaiDownloadUrl
          } : item));
        } catch (error) {
          console.warn('Job status check failed', error);
        }
      }));
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [pollKey]);

  function removeJob(jobId) {
    setJobs(old => old.filter(j => j.id !== jobId));
  }

  function clearDone() {
    setJobs(old => old.filter(j => j.status !== 'เสร็จแล้ว'));
  }

  if (!authReady) return <main className="shell"><section className="auth-card"><h2>กำลังตรวจสอบเซสชัน…</h2></section></main>;
  if (!AUTH_CONFIGURED) return <main className="shell"><section className="auth-card"><h1>ตั้งค่าระบบล็อกอินก่อน</h1><p>ยังไม่ได้กำหนด VITE_COGNITO_USER_POOL_ID และ VITE_COGNITO_CLIENT_ID ในการ Build เว็บไซต์</p></section></main>;
  if (!signedIn) return <main className="shell"><header className="topbar"><a className="brand" href="#"><span className="brand-icon"><AudioLines size={21}/></span><span>AWS <b>Transcribe</b><small>STUDIO</small></span></a></header><section className="auth-card"><div className="auth-icon"><ShieldCheck size={26}/></div><span className="eyebrow">PRIVATE WORKSPACE</span><h1>เข้าสู่ระบบ</h1><p>ใช้บัญชีที่ผู้ดูแลสร้างไว้ใน Amazon Cognito</p><form onSubmit={needsNewPassword?handleNewPassword:handleSignIn}><label htmlFor="auth-email">อีเมล</label><input id="auth-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required disabled={needsNewPassword}/><label htmlFor="auth-password">{needsNewPassword?'รหัสผ่านชั่วคราว':'รหัสผ่าน'}</label><input id="auth-password" type="password" autoComplete={needsNewPassword?'current-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} required disabled={needsNewPassword}/>{needsNewPassword&&<><label htmlFor="auth-new-password">รหัสผ่านใหม่</label><input id="auth-new-password" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></>}<button className="primary-button auth-submit" type="submit">{needsNewPassword?'บันทึกรหัสผ่านใหม่':'เข้าสู่ระบบ'}</button></form>{authMessage&&<p className="auth-message" role="alert">{authMessage}</p>}</section></main>;

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-icon"><AudioLines size={21}/></span><span>AWS <b>Transcribe</b><small>STUDIO</small></span></a>
      <button className="icon-button" aria-label="ออกจากระบบ" title="ออกจากระบบ" onClick={handleSignOut}><X size={19}/></button>
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

    <section className="settings-card">
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
        <div className="job-list">{jobs.map(job=><article className="job" key={job.id}><div className="job-file-icon">{/\.(mp4|webm)$/i.test(job.name)?<FileVideo size={19}/>:<FileAudio size={19}/>}</div><div className="job-info"><b title={job.name}>{job.name}</b><small>{job.size} · {job.status}</small>{job.error&&<small role="alert">{job.error}</small>}{job.originalDownloadUrl&&<div className="job-downloads"><a href={job.originalDownloadUrl} target="_blank" rel="noreferrer" download>ดาวน์โหลด SRT ต้นฉบับ</a>{job.thaiDownloadUrl&&<a href={job.thaiDownloadUrl} target="_blank" rel="noreferrer" download>ดาวน์โหลด SRT ภาษาไทย</a>}</div>}{job.status==='กำลังประมวลผล'&&<div className="progress"><span style={{width:`${job.progress}%`}}/></div>}</div><button className="icon-button subtle" onClick={()=>removeJob(job.id)} aria-label="ลบไฟล์"><Trash2 size={16}/></button></article>)}</div>}
    </section>

    <footer><div className="footer-mark"><AudioLines size={17}/> AWS Transcribe Studio</div><span>Web workspace · Mobile ready</span><p>{notice}</p></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
