// ═══════════════════════════════════════════════════════════
// supabase.js — تهيئة العميل + دوال مساعدة
// ═══════════════════════════════════════════════════════════

// ⚠️ استبدل القيمتين بمعلومات مشروعك من Settings → API
const SUPABASE_URL = 'https://roikpeuqdilrpexagigw.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_MB9oG4sohgXBHV6pg3ae9w_X5KVwIBd';

// تحميل مكتبة Supabase من CDN (يتطلب إنترنت)
// نستخدم UMD build عشان يشتغل بدون bundler
(function loadSupabase(){
  if(window.supabase)return;
  const s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  s.onload=()=>{window.__sbReady&&window.__sbReady()};
  document.head.appendChild(s);
})();

window.sbReady = new Promise(res=>{window.__sbReady=res});

async function getSB(){
  await window.sbReady;
  if(!window.__sbClient){
    window.__sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
  }
  return window.__sbClient;
}

// ─── أدوات مساعدة ───
const MAX_SIZE = 10*1024*1024;
const ALLOWED = ['application/pdf','image/png','image/jpeg','image/jpg','image/webp',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip','text/plain'];

function fileIcon(type,name){
  const t=(type||'').toLowerCase(),n=(name||'').toLowerCase();
  if(t.includes('pdf')||n.endsWith('.pdf'))return{label:'PDF',color:'#b3402e'};
  if(t.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/.test(n))return{label:'IMG',color:'#0f5e54'};
  if(t.includes('word')||/\.(docx?|rtf)$/.test(n))return{label:'DOC',color:'#1e5fa8'};
  if(t.includes('zip')||/\.(zip|rar|7z)$/.test(n))return{label:'ZIP',color:'#8a5a1e'};
  return{label:'FILE',color:'#5c6f69'};
}
function humanSize(b){if(!b)return'0';if(b<1024)return b+' B';if(b<1024*1024)return (b/1024).toFixed(1)+' KB';return (b/1024/1024).toFixed(2)+' MB'}
function validateFile(f){
  if(f.size>MAX_SIZE)return `الملف "${f.name}" أكبر من ${MAX_SIZE/1024/1024}MB`;
  if(f.type&&!ALLOWED.includes(f.type)&&!f.name.match(/\.(pdf|png|jpe?g|webp|docx?|zip|txt)$/i))
    return `نوع الملف "${f.name}" غير مدعوم`;
  return null;
}
const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=t=>new Date(t).toLocaleString('ar-JO',{dateStyle:'medium',timeStyle:'short'});
const isOpen=t=>!t.closed&&new Date(t.deadline)>new Date();
const isSoon=t=>isOpen(t)&&(new Date(t.deadline)-Date.now())<24*3600*1000;
const left=t=>{const m=Math.floor((new Date(t)-Date.now())/6e4),d=Math.floor(m/1440),h=Math.floor(m%1440/60);
  return 'باقي '+(d?d+' يوم و':'')+(d||h?h+' ساعة':(m%60)+' دقيقة')};
const stLabel=st=>({pending:'بانتظار المراجعة',accepted:'مقبول ✓',rejected:'مرفوض ✗',reviewed:'تمت المراجعة'}[st||'pending']);
const stClass=st=>({pending:'pending',accepted:'accepted',rejected:'rejected',reviewed:'reviewed'}[st||'pending']);
const col=n=>'hsl('+([...n].reduce((a,c)=>a+c.charCodeAt(0),0)*37%360)+' 42% 36%)';

// ═══════════════════════════════════════════════════════════
// API — يغلف كل استعلامات Supabase
// ═══════════════════════════════════════════════════════════
const api = {
  // ─── Auth ───
  async signUp({email,password,fullName,role,classCode}){
    const sb = await getSB();
    const meta = {full_name:fullName, role};
    if(classCode) meta.class_code = classCode;
    const {data,error} = await sb.auth.signUp({email,password,options:{data:meta}});
    if(error) throw error;
    return data;
  },
  async signIn({email,password}){
    const sb = await getSB();
    const {data,error} = await sb.auth.signInWithPassword({email,password});
    if(error) throw error;
    return data;
  },
  async signOut(){
    const sb = await getSB();
    await sb.auth.signOut();
  },
  async getUser(){
    const sb = await getSB();
    const {data:{user}} = await sb.auth.getUser();
    return user;
  },
  async getProfile(){
    const sb = await getSB();
    const user = await this.getUser();
    if(!user) return null;
    const {data,error} = await sb.from('profiles').select('*').eq('id',user.id).single();
    if(error) throw error;
    return data;
  },
  async requireAuth(expectedRole){
    const profile = await this.getProfile();
    if(!profile){location.href='auth.html';return null}
    if(expectedRole && profile.role !== expectedRole){
      location.href = profile.role === 'teacher' ? 'admin.html' : 'student.html';
      return null;
    }
    return profile;
  },

  // ─── Classes (المعلم) ───
  async getClasses(){
    const sb = await getSB();
    const {data,error} = await sb.from('classes').select('*').order('created_at',{ascending:false});
    if(error) throw error;
    return data||[];
  },
  async saveClass(c){
    const sb = await getSB();
    const user = await this.getUser();
    const row = {name:c.name, code:c.code, teacher_id:user.id};
    if(c.id){ // تعديل
      const {data,error} = await sb.from('classes').update({name:c.name,code:c.code}).eq('id',c.id).select().single();
      if(error) throw error;
      return data;
    } else {
      const {data,error} = await sb.from('classes').insert(row).select().single();
      if(error) throw error;
      return data;
    }
  },
  async deleteClass(id){
    const sb = await getSB();
    const {error} = await sb.from('classes').delete().eq('id',id);
    if(error) throw error;
  },
  async classCodeExists(code,exceptId){
    const sb = await getSB();
    let q = sb.from('classes').select('id').eq('code',code);
    if(exceptId) q = q.neq('id',exceptId);
    const {data,error} = await q;
    if(error) throw error;
    return data && data.length>0;
  },

  // ─── Tasks ───
  async getTasks(){
    const sb = await getSB();
    const {data,error} = await sb.from('tasks').select('*').is('deleted_at',null).order('created_at',{ascending:false});
    if(error) throw error;
    return data||[];
  },
  async saveTask(t){
    const sb = await getSB();
    const user = await this.getUser();
    const row = {
      title:t.title, description:t.desc||'', deadline:t.deadline,
      class_id:t.classId||null, closed:!!t.closed
    };
    if(t.id){
      const {data,error} = await sb.from('tasks').update(row).eq('id',t.id).select().single();
      if(error) throw error;
      return data;
    } else {
      const {data,error} = await sb.from('tasks').insert({...row,teacher_id:user.id}).select().single();
      if(error) throw error;
      return data;
    }
  },
  async deleteTask(id){
    const sb = await getSB();
    const {error} = await sb.from('tasks').update({deleted_at:new Date().toISOString()}).eq('id',id);
    if(error) throw error;
  },

  // ─── Submissions ───
  async getSubmissionsForTeacher(){
    const sb = await getSB();
    // نجيب كل التسليمات لمهام المعلم (RLS تفلتر تلقائياً)
    const {data,error} = await sb.from('submissions')
      .select('*, submission_files(*)')
      .order('submitted_at',{ascending:false});
    if(error) throw error;
    return data||[];
  },
  async getMySubmissions(){
    const sb = await getSB();
    const user = await this.getUser();
    const {data,error} = await sb.from('submissions')
      .select('*, submission_files(*)')
      .eq('student_id',user.id)
      .order('submitted_at',{ascending:false});
    if(error) throw error;
    return data||[];
  },

  // ─── رفع تسليم جديد ───
  async submitWork({taskId,classId,files,note}){
    const sb = await getSB();
    const user = await this.getUser();

    // 1. إنشاء submission
    const {data:sub,error:subErr} = await sb.from('submissions').insert({
      task_id:taskId, student_id:user.id, class_id:classId,
      note:note||'', status:'pending'
    }).select().single();
    if(subErr) throw subErr;

    // 2. رفع الملفات + إنشاء صفوف
    const uploaded = [];
    try {
      for(const f of files){
        const path = `${user.id}/${taskId}/${Date.now()}_${f.name.replace(/[^\w.\-]/g,'_')}`;
        const {error:upErr} = await sb.storage.from('submissions').upload(path,f,{contentType:f.type,upsert:false});
        if(upErr) throw upErr;
        uploaded.push(path);
        const {error:fileErr} = await sb.from('submission_files').insert({
          submission_id:sub.id, file_path:path,
          file_name:f.name, file_size:f.size, file_type:f.type||'application/octet-stream'
        });
        if(fileErr) throw fileErr;
      }
    } catch(e){
      // rollback: احذف الـ submission والملفات المرفوعة
      for(const p of uploaded){ try{ await sb.storage.from('submissions').remove([p]) }catch{} }
      try{ await sb.from('submissions').delete().eq('id',sub.id) }catch{}
      throw e;
    }
    return sub;
  },

  // ─── تحديث حالة تسليم (معلم) ───
  async updateSubmissionStatus(id,status,teacherNote){
    const sb = await getSB();
    const {data,error} = await sb.from('submissions')
      .update({status,teacher_note:teacherNote||null})
      .eq('id',id).select().single();
    if(error) throw error;
    return data;
  },

  // ─── روابط تحميل موقعة ───
  async getFileUrl(path){
    const sb = await getSB();
    const {data,error} = await sb.storage.from('submissions').createSignedUrl(path,3600);
    if(error) throw error;
    return data.signedUrl;
  },

  // ─── الطلاب (من profiles) ───
  async getStudentsInMyClasses(){
    const sb = await getSB();
    const {data,error} = await sb.from('profiles')
      .select('id, full_name, class_id, role')
      .eq('role','student');
    if(error) throw error;
    return data||[];
  }
};
