// A small PDF writer for client reports: Helvetica text, filled boxes, and lines on US Letter pages,
// with wrapping and page breaks. Builds a real .pdf file in the browser, no outside service.
const PDF_WIDTHS={
  regular:[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
  bold:[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]
};
// Characters outside plain ASCII that Helvetica's WinAnsi encoding has; anything else prints as "?".
const PDF_WINANSI={'€':128,'‚':130,'„':132,'…':133,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'™':153,'·':183};
function pdfBytes(text){const out=[];for(const char of String(text??'')){const code=char.codePointAt(0);if(code>=32&&code<127)out.push(code);else if(PDF_WINANSI[char])out.push(PDF_WINANSI[char]);else if(code>=160&&code<=255)out.push(code);else if(char==='\n'||char==='\t')out.push(32);else if(code>255)out.push(63);}return out;}
function pdfString(text){return pdfBytes(text).map(code=>code===40||code===41||code===92?`\\${String.fromCharCode(code)}`:code>126?`\\${code.toString(8).padStart(3,'0')}`:String.fromCharCode(code)).join('');}
function pdfTextWidth(text,size,bold){const table=PDF_WIDTHS[bold?'bold':'regular'];return pdfBytes(text).reduce((sum,code)=>sum+(code>=32&&code<127?table[code-32]:556),0)*size/1000;}
function pdfRgb(hex){const match=/^#?([0-9a-f]{6})$/i.exec(hex||'');const value=match?match[1]:'101828';return[0,2,4].map(index=>(parseInt(value.slice(index,index+2),16)/255).toFixed(3)).join(' ');}
function pdfWrap(text,maxWidth,size,bold){const lines=[];for(const paragraph of String(text??'').split(/\n+/)){let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){const next=line?`${line} ${word}`:word;if(pdfTextWidth(next,size,bold)<=maxWidth){line=next;continue;}if(line)lines.push(line);line=word;while(pdfTextWidth(line,size,bold)>maxWidth&&line.length>1){let cut=line.length-1;while(cut>1&&pdfTextWidth(line.slice(0,cut),size,bold)>maxWidth)cut-=1;lines.push(line.slice(0,cut));line=line.slice(cut);}}if(line)lines.push(line);}return lines;}
function pdfDocument({margin=48}={}){const W=612,H=792,pages=[];let ops=null;const doc={W,H,margin,y:0,
  newPage(){ops=[];pages.push(ops);doc.y=H-margin;},
  ensure(height){if(!ops||doc.y-height<margin)doc.newPage();},
  text(text,x,y,{size=11,bold=false,color='#101828',align='left'}={}){const width=pdfTextWidth(text,size,bold),left=align==='right'?x-width:align==='center'?x-width/2:x;ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${pdfRgb(color)} rg ${left.toFixed(2)} ${y.toFixed(2)} Td (${pdfString(text)}) Tj ET`);},
  rect(x,y,width,height,color){ops.push(`${pdfRgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);},
  line(x1,y1,x2,y2,color='#e4e7ec',width=0.75){ops.push(`${pdfRgb(color)} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);},
  // Wrapped text at the current position, moving down; breaks pages as needed.
  para(text,{x=margin,width=W-2*margin,size=11,bold=false,color='#101828',gap=4,maxLines=Infinity}={}){const lines=pdfWrap(text,width,size,bold).slice(0,maxLines);for(const line of lines){doc.ensure(size+gap);doc.y-=size;doc.text(line,x,doc.y,{size,bold,color});doc.y-=gap;}},
  blob(){const objects=[],add=body=>{objects.push(body);return objects.length;};
    add('<< /Type /Catalog /Pages 2 0 R >>');add('');add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids=pages.map((page,index)=>{const stream=`${page.join('\n')}\nBT /F1 8 Tf 0.4 0.43 0.47 rg ${(W-margin).toFixed(2)} 24 Td (${pdfString(`Page ${index+1} of ${pages.length}`)}) Tj ET`;const content=add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`);});
    objects[1]=`<< /Type /Pages /Kids [${kids.map(id=>`${id} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let out='%PDF-1.4\n';const offsets=[];objects.forEach((body,index)=>{offsets.push(out.length);out+=`${index+1} 0 obj\n${body}\nendobj\n`;});
    const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([out],{type:'application/pdf'});}};
  return doc;}

// The client report as a PDF: the same numbers, highlights, top posts, and networks as the report page.
function reportPdfBlob({client,period,campaign='',data}){const report=data.report,totals=report.totals||{},brand=clientBrand(client),color=/^#[0-9a-f]{6}$/i.test(brand.colors?.[0]||'')?brand.colors[0]:'#2f6db3',doc=pdfDocument(),M=doc.margin,inner=doc.W-2*M;
  const number=value=>value===null||value===undefined?'—':Number(value).toLocaleString('en-US'),rate=value=>value===null||value===undefined?'—':value>=100?'100%+':`${value}%`;
  const prev=data.previous?.totals||null,delta=(now,before)=>{if(!prev||typeof now!=='number'||typeof before!=='number'||!before)return '';const change=Math.round((now-before)/before*1000)/10;return change===0?'Same as before':`${change>0?'Up':'Down'} ${Math.abs(change)}% vs. before`;};
  doc.newPage();doc.rect(0,doc.H-10,doc.W,10,color);doc.y-=6;
  doc.para(`${client.name} ${campaign?'campaign':'social'} report`,{size:20,bold:true,gap:6});
  doc.para(`${period.label}${campaign?` · Campaign: ${campaign}`:''} · Prepared ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`,{size:10,color:'#5d6676',gap:14});
  const kpis=[['Posts published',report.postCount,data.previous?.postCount,number],['Views',totals.views,prev?.views,number],['Reach',totals.reach,prev?.reach,number],['Engagements',totals.engagements,prev?.engagements,number],['Engagement rate',totals.engagementRate,prev?.engagementRate,rate],['Likes',totals.likes,prev?.likes,number],['Comments',totals.comments,prev?.comments,number],['Shares',totals.shares,prev?.shares,number],['Clicks',totals.clicks,prev?.clicks,number]];
  const columns=3,gapX=10,boxW=(inner-gapX*(columns-1))/columns,boxH=54;
  for(let index=0;index<kpis.length;index+=columns){doc.ensure(boxH+10);const top=doc.y;kpis.slice(index,index+columns).forEach(([label,value,before,format],column)=>{const x=M+column*(boxW+gapX);doc.rect(x,top-boxH,boxW,boxH,'#f5f7fa');doc.text(label,x+10,top-16,{size:9,color:'#5d6676'});doc.text(format(value),x+10,top-34,{size:16,bold:true});const change=format===rate?(prev&&typeof value==='number'&&typeof before==='number'?(value===before?'Same as before':`${value>before?'Up':'Down'} ${Math.round(Math.abs(value-before)*10)/10} pts vs. before`):''):delta(value,before);if(change)doc.text(change,x+10,top-47,{size:8,color:/^Up/.test(change)?'#16834a':/^Down/.test(change)?'#b42318':'#5d6676'});});doc.y=top-boxH-10;}
  const section=title=>{doc.ensure(40);doc.y-=12;doc.para(title,{size:13,bold:true,gap:8});};
  if(data.summary){section('What worked');doc.para(data.summary,{size:10,gap:5});}
  if((data.highlights||[]).length){section('Highlights');data.highlights.forEach(line=>doc.para(`•  ${line}`,{size:10,gap:5}));}
  if(data.scheduled)doc.para(`${data.scheduled} more post${data.scheduled===1?' is':'s are'} scheduled in this period.`,{size:10,color:'#5d6676',gap:6});
  const rows=[...report.rows].sort((a,b)=>(b.metrics.engagements||0)-(a.metrics.engagements||0)).slice(0,campaign?40:5);
  section(campaign?'Posts':'Top posts');
  if(!rows.length)doc.para('No published posts in this period.',{size:10,color:'#5d6676'});
  const col={date:M,network:M+52,text:M+132,views:M+inner-76,eng:M+inner};
  if(rows.length){doc.ensure(20);doc.y-=10;[['Date',col.date],['Network',col.network],['Post',col.text]].forEach(([label,x])=>doc.text(label,x,doc.y,{size:8,bold:true,color:'#5d6676'}));doc.text('Views',col.views,doc.y,{size:8,bold:true,color:'#5d6676',align:'right'});doc.text('Engagements',col.eng,doc.y,{size:8,bold:true,color:'#5d6676',align:'right'});doc.y-=6;doc.line(M,doc.y,M+inner,doc.y);}
  rows.forEach(row=>{const lines=pdfWrap(row.text||'(no caption)',col.views-col.text-90,9,false).slice(0,2),height=lines.length*12+10;doc.ensure(height);const top=doc.y-12;doc.text(row.publishedAt?new Date(row.publishedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—',col.date,top,{size:9});doc.rect(col.network,top+1,6,6,networkColor(row.platform));doc.text(platformLabel(row.platform),col.network+10,top,{size:9});lines.forEach((line,index)=>doc.text(line,col.text,top-index*12,{size:9}));doc.text(number(row.metrics.views),col.views,top,{size:9,align:'right'});doc.text(number(row.metrics.engagements),col.eng,top,{size:9,align:'right'});doc.y-=height;doc.line(M,doc.y+4,M+inner,doc.y+4);});
  const byNetwork={};report.rows.forEach(row=>{const entry=byNetwork[row.platform]||={posts:0,views:0,engagements:0};entry.posts+=1;entry.views+=row.metrics.views||0;entry.engagements+=row.metrics.engagements||0;});
  const networks=Object.entries(byNetwork).sort((a,b)=>b[1].engagements-a[1].engagements),best=Math.max(1,...networks.map(([,entry])=>entry.engagements));
  if(networks.length){section('By network');networks.forEach(([platform,entry])=>{doc.ensure(22);const top=doc.y-12;doc.rect(M,top+1,6,6,networkColor(platform));doc.text(platformLabel(platform),M+10,top,{size:10});doc.text(`${entry.posts} post${entry.posts===1?'':'s'} · ${entry.views.toLocaleString('en-US')} views · ${entry.engagements.toLocaleString('en-US')} engagements`,M+120,top,{size:9,color:'#5d6676'});const barX=M+inner-120;doc.rect(barX,top,120,6,'#eef1f5');doc.rect(barX,top,Math.max(2,120*entry.engagements/best),6,color);doc.y-=22;});}
  return doc.blob();}
