// A short "New in SignalDesk" note on Home, shown once per device after an update, so people notice
// what changed without a tour. Bump WHATS_NEW.id when the list changes. Brand-new people skip it:
// they get the welcome tour instead.
const WHATS_NEW={id:'2026-11-24',items:[
  'Social Inbox now has direct messages from each client’s Facebook Page and Instagram, one client at a time. Mark a conversation done once it’s handled.',
  'Assign posts to teammates, @mention them in notes, and get a week-ahead email on Mondays.',
  'The calendar can color by network, status, or content pillar, show gaps, and move several posts at once.',
  'Analytics has What works and a Compare tab, and client reports download as a PDF.',
  'Bluesky and Mastodon now post directly. Turn on two-factor sign-in under Settings → Security.'
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
