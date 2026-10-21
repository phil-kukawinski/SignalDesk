window.addEventListener('error',e=>{document.body.setAttribute('data-err',(document.body.getAttribute('data-err')||'')+' | '+e.message);});
window.addEventListener('load',()=>setTimeout(async()=>{const log=[];const L=(k,v)=>log.push(k+'='+v);const vis=el=>!!(el&&el.offsetParent!==null);try{
 L('chevron',getComputedStyle(document.querySelector('.option-group summary'),'::after').content);
 showView('calendar');await new Promise(r=>setTimeout(r,50));
 L('defaultView',calView+' active:'+document.querySelector('[data-cal-view].active').textContent+' label:'+document.querySelector('#calendar-month').textContent);
 L('weekCols',document.querySelectorAll('.timeline-col').length+' heads:'+[...document.querySelectorAll('.timeline-day-head')].map(h=>h.textContent).join(' '));
 L('gridHidden',document.querySelector('#calendar-grid').hidden);
 const ev=[...document.querySelectorAll('.timeline-col[data-date="2026-10-16"] .timeline-event')];L('oct16Events',ev.map(e=>e.querySelector('b').textContent+'@'+e.style.top+' w:'+e.style.width).join(' | '));
 L('bands',document.querySelectorAll('.best-time-band').length+' firstLabel:'+document.querySelector('.best-time-band span')?.textContent+' note:'+document.querySelector('#best-times-note').textContent.slice(0,40));
 L('nowLine',!!document.querySelector('.timeline-col.today .timeline-now'));
 L('scrollTop',document.querySelector('#timeline-scroll').scrollTop);
 document.querySelector('#next-month').click();L('nextWeek',document.querySelector('#calendar-month').textContent);
 document.querySelector('[data-cal-view=day]').click();L('dayLabel',document.querySelector('#calendar-month').textContent+' cols:'+document.querySelectorAll('.timeline-col').length);
 document.querySelector('#today-button').click();L('todayDay',document.querySelector('#calendar-month').textContent+' events:'+[...document.querySelectorAll('.timeline-event span')].map(s=>s.textContent).join(' / '));
 document.querySelector('[data-cal-view=month]').click();L('month',document.querySelector('#calendar-month').textContent+' gridShown:'+!document.querySelector('#calendar-grid').hidden+' timelineHidden:'+document.querySelector('#calendar-timeline').hidden+' note:"'+document.querySelector('#best-times-note').textContent+'"');
 document.querySelector('[data-open-day="2026-10-17"]').click();L('openDay',calView+' '+document.querySelector('#calendar-month').textContent+' n:'+document.querySelectorAll('.timeline-event').length);
 document.querySelector('[data-cal-view=week]').click();
 const cs=document.querySelector('#calendar-client');cs.value='revere-rum';cs.dispatchEvent(new Event('change'));L('filterClient',document.querySelectorAll('.timeline-event').length);cs.value='';cs.dispatchEvent(new Event('change'));
 const st=document.querySelector('#calendar-status');st.value='In Review';st.dispatchEvent(new Event('change'));L('filterStatus',[...document.querySelectorAll('.timeline-event span')].map(s=>s.textContent).join(' / '));st.value='';st.dispatchEvent(new Event('change'));
 // overlap: two posts same time
 savedPosts.push({date:'2026-10-16',time:'10:15 AM',client:'Revere Rum',title:'Overlap test',channel:'Facebook',status:'Draft',cls:'event-gold'});renderCalendar();
 L('overlap',[...document.querySelectorAll('.timeline-col[data-date="2026-10-16"] .timeline-event')].map(e=>e.style.left+'|'+e.style.width).join(' ; '));
 // best-times from history
 const pts=[];for(let w=0;w<6;w++){const tue=new Date(2026,8,29+w*7,11,0);pts.push({t:tue.toISOString(),rate:9});const thu=new Date(2026,9,1+w*7,15,0);pts.push({t:thu.toISOString(),rate:2});const fri=new Date(2026,9,2+w*7,9,0);pts.push({t:fri.toISOString(),rate:4});}
 const bt=computeBestTimes(pts);L('computed',`enough:${bt.enough} tue:${JSON.stringify(bt.windows[2])} thu:${JSON.stringify(bt.windows[4])} fri:${JSON.stringify(bt.windows[5])}`);
 L('fewPoints',computeBestTimes(pts.slice(0,5)).enough);
 // checklist
 showView('composer');const box=document.querySelector('.account-select');box.innerHTML=['instagram','twitter','linkedin'].map(p=>`<label class="account-choice"><input type="checkbox" checked value="${p}"><span>${p}</span></label>`).join('');box.dispatchEvent(new Event('change',{bubbles:true}));
 const pc=document.querySelector('#post-copy');pc.value='Grab the the kits at https://pkworks.com/fall. See www.example.com/x too!Thanks '+('x'.repeat(300))+' #a #b #c #d #e #f';pc.dispatchEvent(new Event('input'));
 const items=()=>[...document.querySelectorAll('#checklist .check-item')].map(i=>i.className.replace('check-item ','')+':'+i.querySelector('.check-title').textContent);
 L('checklist',items().join(' | '));
 L('quick',[...document.querySelectorAll('#checklist .check-item')][4].querySelector('.check-list')?.textContent);
 L('platformIssues',[...document.querySelectorAll('#checklist .check-item')][6].querySelector('.check-list').textContent);
 L('links',[...document.querySelectorAll('#checklist .check-item')][7].textContent);
 // simulate signed-in: links + AI proofread
 cloudFeaturesAvailable=()=>true;activeUser={id:'u'};
 callSocialApi=async(p)=>{if(p.action==='check-links')return{results:p.urls.map(u=>u.includes('example')?{url:u,status:'broken',detail:'Page not found (404).'}:{url:u,status:'ok'})};if(p.action==='proofread')return{issues:[{key:'all',original:'the the',suggestion:'the',type:'grammar',reason:'Repeated word'}]};};
 renderChecklist();await new Promise(r=>setTimeout(r,1500));
 L('linksSignedIn',[...document.querySelectorAll('#checklist .check-item')][7].querySelector('.check-title').textContent+' :: '+[...document.querySelectorAll('#checklist .check-item')][7].querySelector('.check-list')?.textContent);
 document.querySelector('[data-proofread]').click();await new Promise(r=>setTimeout(r,50));
 L('proofResult',[...document.querySelectorAll('#checklist .check-item')][4].querySelector('.check-title').textContent);
 document.querySelector('[data-apply-issue="0"]').click();
 L('afterApply',pc.value.slice(0,20)+' | '+[...document.querySelectorAll('#checklist .check-item')][4].querySelector('.check-title').textContent);
 L('time',items()[3]);
}catch(e){L('ERR',e.stack)}document.body.setAttribute('data-log',log.join(' || '));},600));
