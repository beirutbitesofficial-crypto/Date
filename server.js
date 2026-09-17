const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'taha-date-2026';
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.disable('x-powered-by');
app.use(express.json());
app.use('/uploads', express.static(uploadDir, { maxAge: '1h' }));
app.use(express.static(__dirname, { extensions: ['html'], index: 'index.html' }));

const tokens = new Map();
function auth(req,res,next){const t=(req.headers.authorization||'').replace('Bearer ','');if(!tokens.has(t))return res.status(401).json({error:'Unauthorized'});next();}
app.post('/api/admin/login',(req,res)=>{if(req.body.password!==ADMIN_PASSWORD)return res.status(401).json({error:'Wrong password'});const t=crypto.randomBytes(24).toString('hex');tokens.set(t,Date.now());res.json({token:t});});

const storage=multer.diskStorage({destination:(_r,_f,cb)=>cb(null,uploadDir),filename:(req,file,cb)=>{const slot=req.params.slot;if(!['hero','amoura'].includes(slot))return cb(new Error('Invalid slot'));const ext=(path.extname(file.originalname)||'.jpg').toLowerCase();cb(null,slot+ext);}});
const upload=multer({storage,limits:{fileSize:8*1024*1024},fileFilter:(_r,f,cb)=>cb(null,/^image\//.test(f.mimetype))});
function findImage(slot){const files=fs.readdirSync(uploadDir);const f=files.find(x=>x.startsWith(slot+'.'));return f?'/uploads/'+f:null;}
app.get('/api/images',(_req,res)=>res.json({hero:findImage('hero'),amoura:findImage('amoura')}));
app.post('/api/admin/upload/:slot',auth,(req,res,next)=>{const slot=req.params.slot;if(!['hero','amoura'].includes(slot))return res.status(400).json({error:'Invalid slot'});for(const f of fs.readdirSync(uploadDir)){if(f.startsWith(slot+'.'))try{fs.unlinkSync(path.join(uploadDir,f))}catch{}}upload.single('image')(req,res,e=>e?next(e):res.json({ok:true,url:findImage(slot)}));});

app.get('/admin',(_req,res)=>res.sendFile(path.join(__dirname,'admin.html')));
app.get('/health',(_req,res)=>res.json({ok:true}));
app.get('*',(_req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.use((err,_req,res,_next)=>res.status(400).json({error:err.message||'Upload failed'}));
app.listen(PORT,'0.0.0.0',()=>console.log(`Date app running on ${PORT}`));
