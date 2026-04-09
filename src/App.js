import React, { useState, useRef, useEffect } from "react";

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const PROJECT_ID     = "gathering-risom";
const API_KEY        = "AIzaSyB19EhfnPWGoMeTAHmsdNtJnaJ81U8RjkM";
const STORAGE_BUCKET = "gathering-risom.firebasestorage.app";
const BASE           = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const ADMIN_PASSWORD = "gathering2025";

// ─── IMAGE COMPRESSION ────────────────────────────────────────────────────────
async function compressImage(file, maxWidth=1200, quality=0.8) {
  return new Promise(res => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => { res(blob); URL.revokeObjectURL(url); }, "image/jpeg", quality);
    };
    img.src = url;
  });
}

async function uploadToStorage(blob, postId) {
  const path = encodeURIComponent(`photos/${postId}.jpg`);
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?name=${path}&key=${API_KEY}`;
  const r = await fetch(url, { method:"POST", headers:{"Content-Type":"image/jpeg"}, body:blob });
  if (!r.ok) throw new Error("Photo upload failed");
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/photos%2F${postId}.jpg?alt=media&key=${API_KEY}`;
}

// ─── FIRESTORE ────────────────────────────────────────────────────────────────
function toFS(obj) {
  const out = {};
  for (const [k,v] of Object.entries(obj)) {
    if (v===null||v===undefined) continue;
    if (typeof v==="string")       out[k]={stringValue:v};
    else if (typeof v==="number")  out[k]={integerValue:String(v)};
    else if (typeof v==="boolean") out[k]={booleanValue:v};
    else if (typeof v==="object")  out[k]={mapValue:{fields:toFS(v)}};
  }
  return out;
}
function fromFS(fields={}) {
  const out={};
  for (const [k,v] of Object.entries(fields)) {
    if (v.stringValue!==undefined)  out[k]=v.stringValue;
    else if (v.integerValue!==undefined) out[k]=Number(v.integerValue);
    else if (v.booleanValue!==undefined) out[k]=v.booleanValue;
    else if (v.mapValue) out[k]=fromFS(v.mapValue.fields||{});
  }
  return out;
}
async function fsGet(path) {
  const r=await fetch(`${BASE}/${path}?key=${API_KEY}`);
  if (!r.ok) return null;
  return fromFS((await r.json()).fields||{});
}
async function fsPatch(path,data) {
  const fields=toFS(data);
  const mask=Object.keys(fields).map(k=>`updateMask.fieldPaths=${k}`).join("&");
  await fetch(`${BASE}/${path}?${mask}&key=${API_KEY}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({fields})});
}
async function fsAdd(col,data) {
  const r=await fetch(`${BASE}/${col}?key=${API_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fields:toFS(data)})});
  return (await r.json()).name?.split("/").pop();
}
async function fsList(col) {
  const r=await fetch(`${BASE}/${col}?pageSize=200&key=${API_KEY}`);
  return ((await r.json()).documents||[]).map(d=>({id:d.name.split("/").pop(),...fromFS(d.fields||{})}));
}

// ─── DB ───────────────────────────────────────────────────────────────────────
const DB = {
  async getUser(u)   { return fsGet(`users/${u}`); },
  async setUser(u,d) { return fsPatch(`users/${u}`,d); },
  async addPost(d) {
    const {photoURL,photoFile,...rest}=d;
    const postId=Date.now().toString();
    let storedPhotoURL="";
    if (photoFile) {
      try { const blob=await compressImage(photoFile); storedPhotoURL=await uploadToStorage(blob,postId); }
      catch(e) { console.error("Photo upload failed:",e); }
    }
    await fsAdd("posts",{...rest,photoURL:storedPhotoURL,id:postId});
    return postId;
  },
  async getPosts()   { return fsList("posts"); },
  async getAllUsers() { return (await fsList("users")).map(d=>({username:d.id,...d})); },
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DIMS = [
  { id:"agency",     label:"Agency",     question:"How much control do you feel in this space?", lo:"I feel unsure and out of control", hi:"I feel empowered and in control", color:"#7c6fcd", track:"#ede9fe" },
  { id:"competence", label:"Competence", question:"How confident do you feel here?",              lo:"I feel out of my depth",           hi:"I feel completely at ease",        color:"#4a9ead", track:"#e0f2fe" },
  { id:"connection", label:"Connection", question:"Does this place feel like it's for you?",      lo:"This place wasn't made for me",    hi:"I feel like I belong here",        color:"#5a9e7c", track:"#d1fae5" },
];
const HOUSING     = ["Homestay","Kollegium","Shared apartment","Other"];
const HOME_SCALE  = [{v:1,emoji:"😟",label:"Not at all"},{v:2,emoji:"😕",label:"Not really"},{v:3,emoji:"😐",label:"Somewhat"},{v:4,emoji:"😊",label:"Mostly"},{v:5,emoji:"🥰",label:"Very much"}];
const EMOJIS      = ["😩","😕","😐","😊","🤩"];
const HOME_LABELS = ["","Not at all","Not really","Somewhat","Mostly","Very much"];
const C = { bg:"#f5f2ee", dark:"#1c1c1e", mid:"#6b6660", light:"#e8e3dc", accent:"#7c6fcd", accent2:"#c97d4e", white:"#ffffff" };

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function Screen({children,bg=C.bg}) {
  useEffect(()=>{ window.scrollTo(0,0); },[]);
  return(
    <div style={{minHeight:"100vh",background:bg,display:"flex",flexDirection:"column",alignItems:"center",WebkitTextSizeAdjust:"100%"}}>
      <div style={{width:"100%",maxWidth:480,boxSizing:"border-box"}}>{children}</div>
    </div>
  );
}
function Header({title,sub,onBack,right}) {
  return(
    <div style={{background:C.dark,color:C.white,padding:"16px 20px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10}}>
      {onBack&&<button onClick={onBack} style={{background:"none",border:"none",color:"#94a3b8",fontSize:22,cursor:"pointer",padding:0}}>←</button>}
      <div style={{flex:1}}>
        <div style={{fontWeight:600,fontSize:17,letterSpacing:"-0.3px"}}>{title}</div>
        {sub&&<div style={{fontSize:12,color:"#94a3b8",marginTop:1}}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}
function Btn({label,onClick,color=C.accent,disabled,outline}) {
  return <button onClick={onClick} disabled={disabled} style={{width:"100%",padding:"15px",borderRadius:12,fontWeight:600,fontSize:16,cursor:disabled?"not-allowed":"pointer",background:disabled?"#e2e8f0":outline?C.white:color,color:disabled?"#94a3b8":outline?color:C.white,border:outline?`2px solid ${color}`:"none",transition:"all .15s"}}>{label}</button>;
}
function Card({children,style={}}) {
  return <div style={{background:C.white,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.light}`,...style}}>{children}</div>;
}
function SLabel({children}) {
  return <div style={{fontSize:11,fontWeight:600,color:C.mid,letterSpacing:1.2,marginBottom:10,textTransform:"uppercase"}}>{children}</div>;
}
function TextInput({value,onChange,placeholder}) {
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{width:"100%",padding:"11px 13px",borderRadius:10,border:`2px solid ${C.light}`,fontSize:15,boxSizing:"border-box",outline:"none",background:C.bg}}/>;
}

// ─── CUSTOM TOUCH SLIDER ─────────────────────────────────────────────────────
function VibeSlider({dim,value,onChange}) {
  const trackRef = useRef(null);

  const getVal = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(pct * 4) + 1;
  };

  const pct = (value - 1) / 4;

  return (
    <Card style={{marginBottom:10, padding:"14px 16px"}}>
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:2}}>
        <span style={{fontWeight:600, fontSize:14, color:C.dark}}>{dim.label}</span>
        <span style={{marginLeft:"auto", fontSize:26}}>{EMOJIS[value-1]}</span>
      </div>
      <p style={{fontSize:12, color:C.mid, margin:"0 0 20px", lineHeight:1.4}}>{dim.question}</p>

      <div
        ref={trackRef}
        onClick={e => onChange(getVal(e.clientX))}
        onTouchStart={e => { e.preventDefault(); onChange(getVal(e.touches[0].clientX)); }}
        onTouchMove={e => { e.preventDefault(); onChange(getVal(e.touches[0].clientX)); }}
        style={{position:"relative", height:44, cursor:"pointer", userSelect:"none"}}
      >
        {/* Background track */}
        <div style={{position:"absolute", top:"50%", left:0, right:0, height:4,
          background:C.light, borderRadius:2, transform:"translateY(-50%)", pointerEvents:"none"}}/>

        {/* Filled track */}
        <div style={{position:"absolute", top:"50%", left:0, width:`${pct*100}%`, height:4,
          background:dim.color, borderRadius:2, transform:"translateY(-50%)",
          pointerEvents:"none", transition:"width .05s"}}/>

        {/* 5 step dots */}
        {[0,1,2,3,4].map(i => {
          const s = i + 1;
          const active = s <= value;
          const current = s === value;
          return (
            <div key={i} style={{
              position:"absolute", top:"50%", left:`${(i/4)*100}%`,
              transform:"translate(-50%,-50%)",
              width: current ? 16 : 10,
              height: current ? 16 : 10,
              borderRadius:"50%",
              background: active ? dim.color : "#d1c9bf",
              boxShadow: current ? `0 0 0 4px ${dim.color}44` : "none",
              transition:"all .15s",
              pointerEvents:"none"
            }}/>
          );
        })}

        {/* Thumb */}
        <div style={{
          position:"absolute", top:"50%", left:`${pct*100}%`,
          transform:"translate(-50%,-50%)",
          width:30, height:30, borderRadius:"50%",
          background:C.white, border:`3px solid ${dim.color}`,
          boxShadow:"0 2px 8px rgba(0,0,0,0.2)",
          pointerEvents:"none", transition:"left .05s", zIndex:2
        }}/>
      </div>

      <div style={{display:"flex", justifyContent:"space-between", marginTop:8}}>
        <span style={{fontSize:11, color:C.mid, maxWidth:"44%", lineHeight:1.3}}>{dim.lo}</span>
        <span style={{fontSize:11, color:C.mid, maxWidth:"44%", textAlign:"right", lineHeight:1.3}}>{dim.hi}</span>
      </div>
    </Card>
  );
}

function useGPS() {
  const [pos,setPos]=useState(null);
  useEffect(()=>{
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p=>setPos({lat:p.coords.latitude,lng:p.coords.longitude}),
      ()=>setPos(null),
      {enableHighAccuracy:true,timeout:8000}
    );
  },[]);
  return pos;
}

function PostMap({posts}) {
  const id=useRef("map-"+Math.random().toString(36).slice(2));
  const instance=useRef(null);
  useEffect(()=>{
    const geo=posts.filter(p=>p.lat&&p.lng);
    if (!geo.length) return;
    const init=()=>{
      if (instance.current){instance.current.remove();instance.current=null;}
      const L=window.L; if (!L) return;
      const map=L.map(id.current).setView([55.676,12.568],13);
      instance.current=map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(map);
      geo.forEach(p=>{
        const avg=Math.round((p.scores.agency+p.scores.connection+p.scores.competence)/3);
        const cols=["#ef4444","#f97316","#eab308","#22c55e","#7c6fcd"];
        L.circleMarker([p.lat,p.lng],{radius:10,fillColor:cols[avg-1]||"#7c6fcd",color:"#fff",weight:2,fillOpacity:0.9})
          .addTo(map)
          .bindPopup(`<b>@${p.user}</b><br>Agency:${p.scores.agency}/5<br>Connection:${p.scores.connection}/5<br>Competence:${p.scores.competence}/5${p.note?`<br><i>${p.note}</i>`:""}`);
      });
    };
    if (window.L){init();return;}
    const link=document.createElement("link");link.rel="stylesheet";link.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";document.head.appendChild(link);
    const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";s.onload=init;document.head.appendChild(s);
    return()=>{if(instance.current){instance.current.remove();instance.current=null;}};
  },[posts]);
  const geoCount=posts.filter(p=>p.lat&&p.lng).length;
  return(
    <div>
      <div id={id.current} style={{width:"100%",height:320,borderRadius:14,overflow:"hidden",border:`1px solid ${C.light}`,background:C.light}}/>
      {geoCount===0&&<div style={{position:"relative",marginTop:-320,height:320,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",color:C.mid,gap:8,pointerEvents:"none"}}><span style={{fontSize:32}}>🗺️</span><span style={{fontSize:13}}>No GPS data yet</span></div>}
      <p style={{fontSize:11,color:C.mid,marginTop:6,textAlign:"right"}}>{geoCount} of {posts.length} posts have location</p>
    </div>
  );
}

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────
function AdminLoginScreen({onSuccess,onBack}) {
  const [pw,setPw]=useState(""); const [err,setErr]=useState("");
  const check=()=>pw===ADMIN_PASSWORD?onSuccess():setErr("Incorrect password.");
  return(
    <Screen bg={C.dark}>
      <div style={{padding:"72px 28px 0",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:16}}>🔒</div>
        <h2 style={{color:C.white,fontSize:22,fontWeight:600,marginBottom:32}}>Admin Access</h2>
        <div style={{background:C.white,borderRadius:20,padding:"28px 24px",textAlign:"left"}}>
          <SLabel>Password</SLabel>
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&check()}
            placeholder="Enter admin password"
            style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`2px solid ${C.light}`,fontSize:16,boxSizing:"border-box",outline:"none",background:C.bg}}/>
          {err&&<p style={{color:"#ef4444",fontSize:13,margin:"8px 0 0"}}>{err}</p>}
          <div style={{marginTop:16,display:"flex",gap:10}}>
            <button onClick={onBack} style={{flex:1,padding:"14px",background:C.white,border:`2px solid ${C.light}`,borderRadius:12,fontWeight:600,cursor:"pointer",color:C.mid}}>Back</button>
            <button onClick={check} style={{flex:2,padding:"14px",background:C.dark,color:C.white,border:"none",borderRadius:12,fontWeight:600,cursor:"pointer",fontSize:15}}>Enter →</button>
          </div>
        </div>
      </div>
    </Screen>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin}) {
  const [u,setU]=useState(""); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  const go=async()=>{
    const v=u.trim().toLowerCase();
    if (!v){setErr("Enter your username.");return;}
    setLoading(true);
    const user=await DB.getUser(v);
    setLoading(false);
    if (!user?.approved){setErr("Username not found — check with your instructor.");return;}
    onLogin(v,user);
  };
  return(
    <Screen bg={C.dark}>
      <div style={{padding:"72px 28px 0",textAlign:"center"}}>
        <div style={{marginBottom:32}}>
          <div style={{fontSize:32,fontWeight:300,color:C.white,letterSpacing:"0.1em",marginBottom:8,textTransform:"uppercase"}}>Gathering</div>
          <div style={{width:40,height:1,background:C.accent2,margin:"0 auto 16px"}}/>
          <p style={{color:"#64748b",fontSize:14,lineHeight:1.7,maxWidth:260,margin:"0 auto"}}>Listening to the city with your eyes, ears and instincts.</p>
        </div>
        <div style={{background:C.white,borderRadius:20,padding:"28px 24px",textAlign:"left"}}>
          <div style={{background:"#f8fafc",borderRadius:12,padding:"14px 16px",marginBottom:20,display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:16}}>🔒</span>
            <div>
              <p style={{margin:"0 0 3px",fontSize:13,fontWeight:600,color:C.dark}}>Your privacy is protected</p>
              <p style={{margin:0,fontSize:12,color:C.mid,lineHeight:1.6}}>All responses are completely anonymous. Data will not be published or shared outside of DIS.</p>
            </div>
          </div>
          <SLabel>Your username</SLabel>
          <TextInput value={u} onChange={v=>{setU(v);setErr("");}} placeholder="e.g. student01"/>
          {err&&<p style={{color:"#ef4444",fontSize:13,margin:"8px 0 0"}}>{err}</p>}
          <div style={{marginTop:16}}><Btn label={loading?"Checking…":"Enter →"} onClick={go} disabled={loading}/></div>
        </div>
      </div>
    </Screen>
  );
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
function ProfileScreen({user,onDone}) {
  const [homeZip,setHomeZip]       = useState("");
  const [danishZip,setDanishZip]   = useState("");
  const [housing,setHousing]       = useState("");
  const [homeScore,setHomeScore]   = useState(0);
  const [cityShapes,setCityShapes] = useState(3);
  const [favPlace,setFavPlace]     = useState("");
  const [err,setErr]   = useState("");
  const [saving,setSaving] = useState(false);
  const valid = homeZip.trim().length>=3 && danishZip.trim().length>=3 && housing && homeScore>0 && favPlace.trim().length>0;
  const save = async () => {
    if (!valid){setErr("Please fill in all fields.");return;}
    setSaving(true);
    await DB.setUser(user,{approved:true,profile:{homeZip:homeZip.trim(),danishZip:danishZip.trim(),housing,homeScore,cityShapes,favPlace:favPlace.trim()}});
    setSaving(false); onDone();
  };
  return(
    <Screen>
      <Header title="Gathering" sub="A little about you — just once"/>
      <div style={{padding:"16px"}}>
        <div style={{background:C.dark,borderRadius:12,padding:"12px 16px",marginBottom:14}}>
          <p style={{margin:0,fontSize:12,lineHeight:1.6,color:"#94a3b8"}}>Six quick questions. Completely anonymous — nothing here can identify you.</p>
        </div>
        <Card style={{marginBottom:12}}>
          <SLabel>Home university ZIP / postal code</SLabel>
          <p style={{fontSize:13,color:C.mid,margin:"0 0 10px",lineHeight:1.5}}>Where are you normally based? (e.g. 10001, 02134, SW1A)</p>
          <TextInput value={homeZip} onChange={setHomeZip} placeholder="Your home ZIP or postal code"/>
        </Card>
        <Card style={{marginBottom:12}}>
          <SLabel>Your Danish postcode</SLabel>
          <p style={{fontSize:13,color:C.mid,margin:"0 0 10px",lineHeight:1.5}}>Where are you living in Copenhagen? (e.g. 2200, 1050)</p>
          <TextInput value={danishZip} onChange={setDanishZip} placeholder="Your Copenhagen postcode"/>
        </Card>
        <Card style={{marginBottom:12}}>
          <SLabel>Your housing at DIS</SLabel>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {HOUSING.map(h=>(
              <button key={h} onClick={()=>setHousing(h)} style={{padding:"12px 16px",borderRadius:10,textAlign:"left",cursor:"pointer",fontWeight:500,fontSize:14,border:"2px solid",borderColor:housing===h?C.accent:C.light,background:housing===h?"#ede9fe":C.white,color:housing===h?C.accent:C.mid,transition:"all .15s"}}>{h}</button>
            ))}
          </div>
        </Card>
        <Card style={{marginBottom:12}}>
          <SLabel>How at home do you feel in Copenhagen right now?</SLabel>
          <div style={{display:"flex",gap:6}}>
            {HOME_SCALE.map(s=>(
              <button key={s.v} onClick={()=>setHomeScore(s.v)} style={{flex:1,padding:"10px 4px",borderRadius:12,border:"2px solid",borderColor:homeScore===s.v?C.accent:C.light,background:homeScore===s.v?"#ede9fe":C.white,cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
                <div style={{fontSize:22}}>{s.emoji}</div>
                <div style={{fontSize:10,fontWeight:600,color:homeScore===s.v?C.accent:C.mid,marginTop:4,lineHeight:1.2}}>{s.label}</div>
              </button>
            ))}
          </div>
        </Card>
        <Card style={{marginBottom:12}}>
          <SLabel>How much do you think the city around you shapes how you feel?</SLabel>
          <input type="range" min={1} max={5} value={cityShapes} onChange={e=>setCityShapes(Number(e.target.value))}
            style={{width:"100%",accentColor:C.accent,cursor:"pointer",margin:"12px 0 8px"}}/>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:C.mid,maxWidth:"44%",lineHeight:1.4}}>Hardly at all — it's more about family, friends and work</span>
            <span style={{fontSize:11,color:C.mid,maxWidth:"44%",textAlign:"right",lineHeight:1.4}}>Quite a bit — the city is the canvas for all life</span>
          </div>
        </Card>
        <Card style={{marginBottom:24}}>
          <SLabel>What's your favourite place in Copenhagen so far?</SLabel>
          <p style={{fontSize:13,color:C.mid,margin:"0 0 10px",lineHeight:1.5}}>It could be a street, a café, a park, a view — anything.</p>
          <textarea value={favPlace} onChange={e=>setFavPlace(e.target.value)} placeholder="Describe your favourite place…" rows={3}
            style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`2px solid ${C.light}`,fontSize:14,boxSizing:"border-box",resize:"none",outline:"none",background:C.bg}}/>
        </Card>
        {err&&<p style={{color:"#ef4444",fontSize:13,marginBottom:12,textAlign:"center"}}>{err}</p>}
        <Btn label={saving?"Saving…":"Start gathering →"} onClick={save} disabled={!valid||saving}/>
      </div>
    </Screen>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeScreen({user,submissions,onNew,onAdmin}) {
  return(
    <Screen>
      <Header title="Gathering" sub={`@${user}`}/>
      <div style={{padding:"20px"}}>
        <button onClick={onNew} style={{width:"100%",padding:"22px 20px",background:C.dark,color:C.white,border:"none",borderRadius:16,fontWeight:600,fontSize:17,cursor:"pointer",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{textAlign:"left"}}>
            <div>Add to your gathering</div>
            <div style={{fontSize:12,fontWeight:400,color:"#94a3b8",marginTop:2}}>What is this place doing to you?</div>
          </div>
          <span style={{fontSize:22,opacity:.5}}>+</span>
        </button>
        {user==="admin"&&<div style={{marginBottom:16}}><Btn label="Admin Dashboard →" onClick={onAdmin} outline/></div>}
        {submissions.length===0?(
          <div style={{textAlign:"center",padding:"56px 0",color:C.mid}}>
            <div style={{fontSize:36,marginBottom:12}}>🌿</div>
            <p style={{fontSize:14,lineHeight:1.7}}>Your gathering is empty.<br/>Go out and notice something.</p>
          </div>
        ):[...submissions].reverse().map((s,i)=>(
          <div key={i} style={{background:C.white,borderRadius:16,overflow:"hidden",marginBottom:14,border:`1px solid ${C.light}`}}>
            {s.photoURL&&<img src={s.photoURL} alt="" style={{width:"100%",aspectRatio:"4/3",objectFit:"cover"}}/>}
            <div style={{padding:"14px 16px"}}>
              <div style={{display:"flex",gap:10,marginBottom:s.note?10:0}}>
                {DIMS.map(d=>(
                  <div key={d.id} style={{flex:1,textAlign:"center"}}>
                    <div style={{fontSize:18}}>{EMOJIS[s.scores[d.id]-1]}</div>
                    <div style={{fontSize:10,color:d.color,fontWeight:600,marginTop:2}}>{d.label}</div>
                  </div>
                ))}
              </div>
              {s.note&&<p style={{margin:"0 0 6px",fontSize:13,color:"#475569",lineHeight:1.5}}>{s.note}</p>}
              <p style={{margin:0,fontSize:11,color:C.mid}}>{new Date(s.timestamp).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ─── CAPTURE ─────────────────────────────────────────────────────────────────
function CaptureScreen({onPhoto,onBack}) {
  const ref=useRef(); const [preview,setPreview]=useState(null); const [file,setFile]=useState(null);
  const gps=useGPS();
  return(
    <Screen>
      <Header title="Step 1 — The place" onBack={onBack}/>
      <div style={{padding:"24px 20px"}}>
        <p style={{color:C.mid,fontSize:14,marginBottom:8,lineHeight:1.7}}>Find something that's making you feel something. The quiet things count too.</p>
        <p style={{fontSize:12,color:gps?"#5a9e7c":"#c97d4e",marginBottom:20}}>{gps?"Location captured":"Getting your location…"}</p>
        <input ref={ref} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){setFile(f);setPreview(URL.createObjectURL(f));}}}/>
        {!preview?(
          <button onClick={()=>ref.current.click()} style={{width:"100%",aspectRatio:"4/3",background:C.light,border:`2px dashed #c4bdb5`,borderRadius:16,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",color:C.mid,gap:10}}>
            <span style={{fontSize:48}}>📷</span>
            <span style={{fontSize:15,fontWeight:500}}>Tap to take a photo</span>
          </button>
        ):(
          <>
            <img src={preview} alt="" style={{width:"100%",borderRadius:16,aspectRatio:"4/3",objectFit:"cover",marginBottom:14}}/>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setPreview(null);setFile(null);}} style={{flex:1,padding:"13px",background:C.white,border:`2px solid ${C.light}`,borderRadius:10,fontWeight:600,cursor:"pointer",color:C.mid}}>Retake</button>
              <button onClick={()=>onPhoto(preview,file,gps)} style={{flex:2,padding:"13px",background:C.dark,color:C.white,border:"none",borderRadius:10,fontWeight:600,cursor:"pointer",fontSize:15}}>Use this →</button>
            </div>
          </>
        )}
      </div>
    </Screen>
  );
}

// ─── TAG ─────────────────────────────────────────────────────────────────────
function TagScreen({photoURL,gps,onSubmit,onBack}) {
  const [scores,setScores]=useState({agency:3,connection:3,competence:3});
  const [note,setNote]=useState(""); const [submitting,setSubmitting]=useState(false);
  const handleSubmit=async()=>{
    setSubmitting(true);
    await new Promise(r=>setTimeout(r,400));
    onSubmit({photoURL,scores,note,timestamp:new Date().toISOString(),...(gps||{})});
  };
  return(
    <Screen>
      <Header title="Step 2 — Your response" onBack={onBack}/>
      <div style={{padding:"20px"}}>
        <img src={photoURL} alt="" style={{width:"100%",borderRadius:14,aspectRatio:"16/9",objectFit:"cover",marginBottom:16}}/>
        <p style={{fontSize:14,color:C.mid,marginBottom:16,lineHeight:1.7}}>How did this place make you feel? Slide honestly.</p>
        {DIMS.map(d=><VibeSlider key={d.id} dim={d} value={scores[d.id]} onChange={v=>setScores(s=>({...s,[d.id]:v}))}/>)}
        <Card style={{marginBottom:20}}>
          <SLabel>What were you noticing? (optional)</SLabel>
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe what caught your attention…" rows={3}
            style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`2px solid ${C.light}`,fontSize:14,boxSizing:"border-box",resize:"none",outline:"none",background:C.bg}}/>
        </Card>
        <Btn label={submitting?"Adding to your gathering…":"Add to gathering ✓"} onClick={handleSubmit} disabled={submitting}/>
      </div>
    </Screen>
  );
}

// ─── SUCCESS ─────────────────────────────────────────────────────────────────
function SuccessScreen({onDone}) {
  return(
    <Screen bg={C.bg}>
      <div style={{padding:"80px 28px",textAlign:"center"}}>
        <div style={{fontSize:64,marginBottom:16}}>🌿</div>
        <h2 style={{fontSize:26,fontWeight:600,color:C.dark,margin:"0 0 10px",letterSpacing:"-0.5px"}}>Gathered.</h2>
        <p style={{color:C.mid,marginBottom:40,lineHeight:1.7}}>This moment is part of your gathering now.<br/>Keep noticing.</p>
        <Btn label="Back to your gathering" onClick={onDone}/>
      </div>
    </Screen>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function AdminScreen({onBack}) {
  const [tab,setTab]=useState("feed");
  const [posts,setPosts]=useState([]); const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [newUser,setNewUser]=useState(""); const [addMsg,setAddMsg]=useState("");
  const CITY_SHAPES_LABELS=["","Hardly at all","Not much","Somewhat","Quite a bit","Very much"];

  useEffect(()=>{
    (async()=>{const [p,u]=await Promise.all([DB.getPosts(),DB.getAllUsers()]);setPosts(p);setUsers(u);setLoading(false);})();
  },[]);

  const addUser=async()=>{
    const v=newUser.trim().toLowerCase(); if(!v)return;
    await DB.setUser(v,{approved:true});
    setUsers(u=>[...u,{username:v,approved:true}]);
    setNewUser(""); setAddMsg(`✓ @${v} added`); setTimeout(()=>setAddMsg(""),3000);
  };
  const removeUser=async(u)=>{await DB.setUser(u,{approved:false});setUsers(us=>us.filter(x=>x.username!==u));};
  const downloadCSV=()=>{
    const rows=[["Timestamp","User","Lat","Lng","Agency","Connection","Competence","Note","Home ZIP","Danish ZIP","Housing","Feeling at Home","City Shapes (1-5)","Favourite Place"]];
    posts.forEach(p=>{
      const u=users.find(x=>x.username===p.user)||{}; const pr=u.profile||{};
      rows.push([p.timestamp,p.user||"?",p.lat||"",p.lng||"",p.scores?.agency,p.scores?.connection,p.scores?.competence,p.note||"",pr.homeZip||"",pr.danishZip||"",pr.housing||"",pr.homeScore||"",pr.cityShapes||"",pr.favPlace||""]);
    });
    const csv=rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const a=document.createElement("a"); a.href="data:text/csv,"+encodeURIComponent(csv); a.download="gathering.csv"; a.click();
  };

  return(
    <Screen>
      <Header title="Gathering — Admin" onBack={onBack} right={<button onClick={downloadCSV} style={{background:C.accent,color:C.white,border:"none",borderRadius:8,padding:"7px 12px",fontWeight:600,fontSize:12,cursor:"pointer"}}>Export CSV</button>}/>
      <div style={{display:"flex",gap:8,padding:"16px 16px 0"}}>
        {[["Posts",posts.length,C.accent],["Students",users.filter(u=>u.approved&&u.username!=="admin").length,"#5a9e7c"],["GPS",posts.filter(p=>p.lat).length,C.accent2]].map(([l,v,c])=>(
          <div key={l} style={{flex:1,background:C.white,borderRadius:12,padding:"12px",textAlign:"center",border:`1px solid ${C.light}`}}>
            <div style={{fontSize:22,fontWeight:700,color:c}}>{v}</div>
            <div style={{fontSize:11,color:C.mid}}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:4,padding:"14px 16px 0"}}>
        {[["feed","Feed"],["map","Map"],["users","Students"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"none",fontWeight:600,fontSize:12,cursor:"pointer",background:tab===id?C.dark:C.light,color:tab===id?C.white:C.mid,transition:"all .15s"}}>{label}</button>
        ))}
      </div>
      <div style={{padding:"16px"}}>
        {loading&&<p style={{textAlign:"center",color:C.mid,padding:"40px 0"}}>Loading…</p>}
        {!loading&&tab==="feed"&&(
          posts.length===0?<p style={{textAlign:"center",color:C.mid,padding:"40px 0"}}>No posts yet.</p>
          :[...posts].reverse().map((p,i)=>{
            const u=users.find(x=>x.username===p.user)||{}; const pr=u.profile||{};
            return(
              <div key={i} style={{background:C.white,borderRadius:14,marginBottom:12,overflow:"hidden",border:`1px solid ${C.light}`}}>
                {p.photoURL&&<img src={p.photoURL} alt="" style={{width:"100%",height:180,objectFit:"cover"}}/>}
                <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <span style={{fontWeight:600,fontSize:14}}>@{p.user||"?"}</span>
                    <span style={{fontSize:12,color:C.mid}}>{new Date(p.timestamp).toLocaleDateString()}</span>
                  </div>
                  {(pr.homeZip||pr.housing||pr.homeScore)&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                      {pr.homeZip&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:999,background:C.bg,color:C.mid,fontWeight:500}}>🏠 {pr.homeZip}</span>}
                      {pr.danishZip&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:999,background:C.bg,color:C.mid,fontWeight:500}}>📍 CPH {pr.danishZip}</span>}
                      {pr.housing&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:999,background:C.bg,color:C.mid,fontWeight:500}}>{pr.housing}</span>}
                      {pr.homeScore&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:999,background:"#ede9fe",color:C.accent,fontWeight:500}}>{HOME_LABELS[pr.homeScore]} at home</span>}
                      {pr.cityShapes&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:999,background:"#fef3c7",color:"#92400e",fontWeight:500}}>City: {CITY_SHAPES_LABELS[pr.cityShapes]}</span>}
                    </div>
                  )}
                  {pr.favPlace&&<p style={{margin:"0 0 8px",fontSize:12,color:C.mid,fontStyle:"italic"}}>❤️ "{pr.favPlace}"</p>}
                  <div style={{display:"flex",gap:8,marginBottom:p.note?10:0}}>
                    {DIMS.map(d=>(
                      <div key={d.id} style={{flex:1,background:d.track,borderRadius:8,padding:"7px",textAlign:"center"}}>
                        <div style={{fontSize:16}}>{EMOJIS[(p.scores?.[d.id]||3)-1]}</div>
                        <div style={{fontSize:10,fontWeight:600,color:d.color}}>{d.label}</div>
                        <div style={{fontSize:12,fontWeight:700,color:d.color}}>{p.scores?.[d.id]||"?"}/5</div>
                      </div>
                    ))}
                  </div>
                  {p.note&&<p style={{margin:0,fontSize:13,color:"#475569"}}>{p.note}</p>}
                </div>
              </div>
            );
          })
        )}
        {!loading&&tab==="map"&&<PostMap posts={posts}/>}
        {!loading&&tab==="users"&&(
          <div>
            <Card style={{marginBottom:14}}>
              <SLabel>Add a student</SLabel>
              <div style={{display:"flex",gap:8}}>
                <input value={newUser} onChange={e=>setNewUser(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addUser()} placeholder="username"
                  style={{flex:1,padding:"10px 12px",borderRadius:10,border:`2px solid ${C.light}`,fontSize:14,outline:"none",background:C.bg}}/>
                <button onClick={addUser} style={{padding:"10px 16px",background:C.dark,color:C.white,border:"none",borderRadius:10,fontWeight:600,cursor:"pointer"}}>Add</button>
              </div>
              {addMsg&&<p style={{color:"#5a9e7c",fontSize:13,margin:"8px 0 0"}}>{addMsg}</p>}
            </Card>
            {users.filter(u=>u.username!=="admin"&&u.approved).map((u,i)=>(
              <div key={i} style={{background:C.white,borderRadius:12,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.light}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>@{u.username}</div>
                  {u.profile&&<div style={{fontSize:12,color:C.mid,marginTop:2}}>{u.profile.housing} · CPH {u.profile.danishZip} · {HOME_LABELS[u.profile.homeScore]} at home</div>}
                  {u.profile?.favPlace&&<div style={{fontSize:11,color:C.mid,marginTop:2,fontStyle:"italic"}}>❤️ {u.profile.favPlace}</div>}
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{posts.filter(p=>p.user===u.username).length} posts</div>
                </div>
                <button onClick={()=>removeUser(u.username)} style={{background:"none",border:"1px solid #fecaca",color:"#ef4444",borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Screen>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,setScreen]=useState("login");
  const [user,setUser]=useState(null);
  const [photo,setPhoto]=useState({url:null,file:null});
  const [gps,setGps]=useState(null);
  const [subs,setSubs]=useState([]);

  const login=async(u,doc)=>{
    setUser(u);
    if (u!=="admin") {
      try { const all=await DB.getPosts(); setSubs(all.filter(p=>p.user===u)); }
      catch(e) { console.error("Failed to load posts:",e); }
    }
    setScreen(u==="admin"?"adminlogin":doc?.profile?.homeZip?"home":"profile");
  };
  const submit=async(e)=>{
    const entry={...e,user,photoFile:photo.file};
    await DB.addPost(entry);
    setSubs(s=>[...s,{...entry,photoURL:photo.url}]);
    setScreen("success");
  };

  if (screen==="adminlogin") return <AdminLoginScreen onSuccess={()=>setScreen("home")} onBack={()=>setScreen("login")}/>;
  if (screen==="login")      return <LoginScreen onLogin={login}/>;
  if (screen==="profile")    return <ProfileScreen user={user} onDone={()=>setScreen("home")}/>;
  if (screen==="home")       return <HomeScreen user={user} submissions={subs} onNew={()=>setScreen("capture")} onAdmin={()=>setScreen("admin")}/>;
  if (screen==="capture")    return <CaptureScreen onPhoto={(url,file,g)=>{setPhoto({url,file});setGps(g);setScreen("tag");}} onBack={()=>setScreen("home")}/>;
  if (screen==="tag")        return <TagScreen photoURL={photo.url} gps={gps} onSubmit={submit} onBack={()=>setScreen("capture")}/>;
  if (screen==="success")    return <SuccessScreen onDone={()=>setScreen("home")}/>;
  if (screen==="admin")      return <AdminScreen onBack={()=>setScreen("home")}/>;
}
