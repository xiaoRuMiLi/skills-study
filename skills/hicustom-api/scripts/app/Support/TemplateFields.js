const fs = require('fs');
const path = require('path');
function decodeXml(s){return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,d)=>String.fromCharCode(+d)).replace(/&amp;/g,'&');}
function colToIdx(col){let n=0;for(const ch of col)n=n*26+(ch.charCodeAt(0)-64);return n-1;}
function idxToCol(i){let s='';i++;while(i>0){const r=(i-1)%26;s=String.fromCharCode(65+r)+s;i=Math.floor((i-1)/26);}return s;}
function parseSharedStrings(file){ if(!fs.existsSync(file))return[]; const xml=fs.readFileSync(file,'utf8'); const out=[]; const re=/<si>([\s\S]*?)<\/si>/g; let m; while((m=re.exec(xml))){ const inner=m[1]; let text=''; const tre=/<t[^>]*>([\s\S]*?)<\/t>/g; let tm; while((tm=tre.exec(inner)))text+=tm[1]; out.push(decodeXml(text)); } return out; }
function readGrid(sheetFile, ss, maxRows){ const xml=fs.readFileSync(sheetFile,'utf8'); const rows={}; const rowRe=/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g; let rm; let n=0; while((rm=rowRe.exec(xml))&&n<maxRows){ const r=+rm[1]; n++; const cells={}; const cellRe=/<c r="([A-Z]+)\d+"(?:[^>]*?t="([^"]*)")?[^>]*>([\s\S]*?)<\/c>/g; let cm; while((cm=cellRe.exec(rm[2]))){ const ci=colToIdx(cm[1]); const t=cm[2]; const inner=cm[3]; let val=''; if(t==='inlineStr'){const im=inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); val=im?decodeXml(im[1]):'';} else{const vm=inner.match(/<v>([\s\S]*?)<\/v>/); if(vm) val=t==='s'?ss[+vm[1]]:decodeXml(vm[1]);} if(val!=='')cells[ci]=val; } if(Object.keys(cells).length) rows[r]=cells; } return rows; }
function unzipXlsm(tpl){
  const crypto=require('crypto'); const tmp=path.join(require('os').tmpdir(),'listing_tpl_'+crypto.createHash('md5').update(tpl).digest('hex').slice(0,8));
  if(!fs.existsSync(path.join(tmp,'xl','workbook.xml'))){ fs.mkdirSync(tmp,{recursive:true}); const zip=path.join(tmp,'tpl.zip'); fs.copyFileSync(tpl,zip); require('child_process').execSync('powershell -NoProfile -Command "Expand-Archive -LiteralPath \''+zip+'\' -DestinationPath \''+tmp+'\' -Force"',{stdio:'pipe'}); }
  return tmp;
}
// 返回 { columns:[{label, attribute, required, col, group}], productTypes:[] }
function readTemplateStructure(tpl){
  if(!tpl||!fs.existsSync(tpl)) return { columns:[], productTypes:[] };
  try{
    const tmp=unzipXlsm(tpl);
    const read=(f)=>fs.readFileSync(path.join(tmp,f),'utf8');
    const wb=read('xl/workbook.xml');
    const rels=read('xl/_rels/workbook.xml.rels');
    const sheets=[]; const sre=/<sheet name="([^"]*)"[^>]*r:id="(rId\d+)"/g; let sm; while((sm=sre.exec(wb))) sheets.push([decodeXml(sm[1]),sm[2]]);
    const ridMap={}; const rre=/Id="(rId\d+)"[^>]*Target="([^"]*)"/g; let rrm; while((rrm=rre.exec(rels))) ridMap[rrm[1]]=rrm[2];
    const sheetFile=(name)=>{ const rid=(sheets.find(s=>s[0]===name)||[])[1]; if(!rid) return null; return path.join(tmp,'xl',ridMap[rid].replace(/^\/?xl\//,'')); };
    const ss=parseSharedStrings(path.join(tmp,'xl/sharedStrings.xml'));
    // 模板 Template 表：第4行=列标签(labels)，第5行=attribute名
    const tplFile=sheetFile('Template')||sheetFile('模板');
    const tplRows=readGrid(tplFile,ss,6);
    // Data Definitions：第2行表头，第3行起 group(A)/label(C)/def(D)/example(E)/required(F)
    const defFile=sheetFile('Data Definitions')||sheetFile('数据定义');
    const defRows=readGrid(defFile,ss,9999);
    const requiredByLabel={};
    for(const r of Object.values(defRows)){ const label=r[2]; const req=r[5]; if(label&&req) requiredByLabel[label]=req; }
    const labelRow=tplRows[4]||{}, attrRow=tplRows[5]||{};
    const maxCol=Math.max(...Object.keys(labelRow).map(Number).filter(c=>c>=0), ...Object.keys(attrRow).map(Number).filter(c=>c>=0));
    const columns=[];
    for(let c=0;c<=maxCol;c++){ const label=labelRow[c]||''; const attribute=attrRow[c]||''; if(label||attribute) columns.push({ label, attribute, required: requiredByLabel[label]||'', col: idxToCol(c) }); }
    // product types（复用命名范围）
    let productTypes=[];
    const m=wb.match(/<definedName name="product_type1\.value"[^>]*>([^<]+)<\/definedName>/);
    if(m){ const dm=decodeXml(m[1]).match(/'?([^'!]+)'?!\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)/); if(dm){ const f=sheetFile(dm[1]); const pRows=readGrid(f,ss,9999); const c1=colToIdx(dm[2]), c2=colToIdx(dm[4]), r1=+dm[3], r2=+dm[5]; const opts=[]; for(const [rn,cells] of Object.entries(pRows)){ const r=+rn; if(r<r1||r>r2) continue; for(const [ci,v] of Object.entries(cells)){ const c=+ci; if(c<c1||c>c2&&c!==c1) continue; if(v) opts.push(v); } } productTypes=[...new Set(opts)]; } }
    return { columns, productTypes };
  }catch(e){ return { columns:[], productTypes:[], error:e.message }; }
}
module.exports={ readTemplateStructure, unzipXlsm };
