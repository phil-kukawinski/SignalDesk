// A short "New in SignalDesk" note on Home, shown once per device after an update, so people notice
// what changed without a tour. Bump WHATS_NEW.id when the list changes. Brand-new people skip it:
// they get the welcome tour instead.
const WHATS_NEW={id:'2026-11-17',items:[
  'Failed posts now say what went wrong and how to fix it.',
  'Type @ in a caption to tag accounts this client has used before.',
  'The Publishing Studio opens on your last client and networks.',
  'Emails are color coded: red needs fixing, yellow needs a look, green went well.'
]};
const WHATS_NEW_KEY='signaldesk-whats-new-seen';
function whatsNewSeen(){try{return localStorage.getItem(WHATS_NEW_KEY)===WHATS_NEW.id;}catch{return true;}}
function markWhatsNewSeen(){try{localStorage.setItem(WHATS_NEW_KEY,WHATS_NEW.id);}catch{/* private window: show it again next time */}}
function renderWhatsNew(){
  const existing=$('#whats-new');
  if(whatsNewSeen()||!cloudFeaturesAvailable()){existing?.remove();return;}
  if(!tourSeen()){markWhatsNewSeen();existing?.remove();return;}
  if(existing)return;
  const anchor=$('#view-overview .attention-strip')||$('#view-overview .stats-grid');if(!anchor)return;
  const note=document.createElement('section');note.id='whats-new';note.className='whats-new';note.setAttribute('aria-label','New in SignalDesk');
  note.innerHTML=`<div><b>New in SignalDesk</b><ul>${WHATS_NEW.items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></div><button type="button" class="text-button" data-whats-new-close>Got it</button>`;
  anchor.before(note);
}
document.addEventListener('click',event=>{if(!event.target.closest('[data-whats-new-close]'))return;markWhatsNewSeen();$('#whats-new')?.remove();});
