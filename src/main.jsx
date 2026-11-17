import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioLines, Check, ChevronDown, Clock3, CloudUpload, Download, FileAudio, FileVideo, Languages, ListMusic, LoaderCircle, Play, Plus, Settings2, ShieldCheck, Trash2, UploadCloud, X } from 'lucide-react';
import './styles.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\\/$/, '');
const mimeFor = (file) => file.type || ({mp3:'audio/mpeg',mp4:'video/mp4',m4a:'audio/mp4',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',webm:'video/webm'}[file.name.split('.').pop().toLowerCase()] || 'application/octet-stream');

const fmt = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(1)} MB`;
const id = () => globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random());

function App() {
  const [jobs, setJobs] = useState([]);
  const [language, setLanguage] = useState('auto');
  const [translate, setTranslate] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('เลือกไฟล์เสียงหรือวิดีโอเพื่อเริ่มต้น');
  const inputRef = useRef(null);
  const counts = useMemo(() => ({
    all: jobs.length,
    queued: jobs.filter(j => j.status === 'รอคิว').length,
    done: jobs.filter(j => j.status === 'เสร็จแล้ว').length
  }), [jobs]);

  async function addFiles(fileList) {
    const accepted = Array.from(fileList || []).filter(f => /\\.(mp3|mp4|m4a|wav|flac|ogg|webm)$/i.test(f.name));
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
          method:'POST', headers:{'content-type':'application/json'},
          body:JSON.stringify({ fileName:file.name, contentType, size:file.size })
        });
        if (!uploadResponse.ok) throw new Error((await uploadResponse.json()).error || 'ขอ URL อัปโหลดไม่สำเร็จ');
        const upload = await uploadResponse.json();
        setJobs(old => old.map(j => j.id === localId ? {...j,progress:35,status:'กำลังส่งไฟล์ไป S3'} : j));
        const putResponse = await fetch(upload.uploadUrl, { method:'PUT', headers:{'content-type':contentType}, body:file });
        if (!putResponse.ok) throw new Error('อัปโหลดไป S3 ไม่สำเร็จ');
        const jobResponse = await fetch(`${API_BASE}/jobs`, {
          method:'POST', headers:{'content-type':'application/json'},
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

  function removeJob(jobId) {
    setJobs(old => old.filter(j => j.id !== jobId));
  }

  function clearDone() {
    setJobs(old => old.filter(j => j.status !== 'เสร็จแล้ว'));
  }

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-icon"><AudioLines size={21}/></span><span>AWS <b>Transcribe</b><small>STUDIO</small></span></a>
      <button className="icon-button" aria-label="ตั้งค่า"><Settings2 size={19}/></button>
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
        <div className="job-list">{jobs.map(job=><article className="job" key={job.id}><div className="job-file-icon">{/\.(mp4|webm)$/i.test(job.name)?<FileVideo size={19}/>:<FileAudio size={19}/>}</div><div className="job-info"><b title={job.name}>{job.name}</b><small>{job.size} · {job.status}</small>{job.status==='กำลังประมวลผล'&&<div className="progress"><span style={{width:`${job.progress}%`}}/></div>}</div><button className="icon-button subtle" onClick={()=>removeJob(job.id)} aria-label="ลบไฟล์"><Trash2 size={16}/></button></article>)}</div>}
    </section>

    <footer><div className="footer-mark"><AudioLines size={17}/> AWS Transcribe Studio</div><span>Web workspace · Mobile ready</span><p>{notice}</p></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
