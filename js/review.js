// Client review page: loads a client's upcoming posts with the private token in the URL fragment.
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const hash = new URLSearchParams(location.hash.slice(1)), token = hash.get('t') || '', campaign = hash.get('campaign') || '';
  const NAME_KEY = 'signaldesk-review-name';
  let posts = [], filter = 'all', approveArmed = false;
  const approvable = () => posts.filter((post) => !post.clientStatus);
  const BATCH = 25;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const toast = (message) => { const el = $('#review-toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3200); };
  try { $('#review-name').value = localStorage.getItem(NAME_KEY) || ''; } catch { /* storage unavailable */ }
  $('#review-name').addEventListener('change', (event) => { try { localStorage.setItem(NAME_KEY, event.target.value.trim()); } catch { /* storage unavailable */ } });

  async function api(payload) {
    const response = await fetch('/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, ...payload }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Something went wrong. Try again.');
    return result;
  }

  function chip(post) {
    if (post.clientStatus === 'approved') return '<span class="review-chip approved">You approved</span>';
    if (post.clientStatus === 'changes_requested') return '<span class="review-chip changes">Changes requested</span>';
    return post.status === 'waiting' ? '<span class="review-chip waiting">Waiting for your approval</span>' : '<span class="review-chip">Scheduled</span>';
  }

  function versionHtml(version) {
    return `<p class="review-copy">${escapeHtml(version.text)}</p>${mediaThumbsHtml(version.media, { className: 'large' })}`;
  }

  function renderApproveAll() {
    const button = $('#review-approve-all'), count = approvable().length;
    button.hidden = count < 2;
    button.textContent = approveArmed ? `Yes, approve all ${count}` : `Approve all ${count}`;
    button.classList.toggle('armed', approveArmed);
  }

  async function approveAll(button) {
    const name = $('#review-name').value.trim();
    if (!name) { toast('Add your name at the top first.'); $('#review-name').focus(); return; }
    if (!approveArmed) { approveArmed = true; renderApproveAll(); return; }
    const items = approvable(), total = items.length;
    button.disabled = true;
    let released = 0;
    try {
      for (let index = 0; index < total; index += BATCH) {
        const chunk = items.slice(index, index + BATCH), last = index + BATCH >= total;
        button.textContent = `Approving… ${Math.min(index + BATCH, total)} of ${total}`;
        const result = await api({ action: 'approve-many', postIds: chunk.map((post) => post.id), name, comment: '', notify: last, total });
        released += result.released;
        chunk.forEach((post) => { post.clientStatus = 'approved'; post.notes.push({ author: name, body: '', decision: 'approved' }); });
      }
      toast(released ? `Approved ${total}. ${released === 1 ? 'One is' : `${released} are`} now scheduled.` : `Approved ${total}. Thank you!`);
    } catch (error) {
      toast(error.message);
    }
    approveArmed = false;
    button.disabled = false;
    render();
  }

  function render() {
    renderApproveAll();
    const list = $('#review-list');
    const shown = posts.filter((post) => filter === 'all' || (post.status === 'waiting' && post.clientStatus !== 'approved'));
    if (!shown.length) {
      list.innerHTML = `<div class="review-empty">${posts.length ? 'Nothing is waiting for your approval.' : 'No upcoming posts right now. Check back later.'}</div>`;
      return;
    }
    list.innerHTML = shown.map((post) => {
      const when = new Date(post.scheduledFor).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const notes = post.notes.map((note) => `<li><b>${escapeHtml(note.author)}</b> ${note.decision === 'approved' ? 'approved' : note.decision === 'changes_requested' ? 'asked for changes' : 'commented'}${note.body ? `: ${escapeHtml(note.body)}` : ''}</li>`).join('');
      return `<article class="review-card" data-post="${escapeHtml(post.id)}">
        <div class="review-card-head"><div><h2>${escapeHtml(post.title || 'Untitled post')}</h2><time>${escapeHtml(when)}${post.campaign ? ` · ${escapeHtml(post.campaign)}` : ''}</time></div>${chip(post)}</div>
        <div class="review-tabs" role="tablist">${post.versions.map((version, index) => `<button type="button" role="tab" class="${index ? '' : 'active'}" data-version="${index}">${escapeHtml(version.label)}</button>`).join('')}</div>
        <div class="review-version">${post.versions[0] ? versionHtml(post.versions[0]) : ''}</div>
        ${notes ? `<ul class="review-notes">${notes}</ul>` : ''}
        <div class="review-actions"><textarea placeholder="Comments or requested changes (optional for approval)" maxlength="2000" aria-label="Comment"></textarea>
          <div class="review-buttons"><button type="button" class="approve" data-decision="approved">✓ Approve</button><button type="button" data-decision="changes_requested">Request changes</button><button type="button" data-comment>Comment only</button></div></div>
      </article>`;
    }).join('');
  }

  document.addEventListener('click', async (event) => {
    const approveButton = event.target.closest('#review-approve-all');
    if (approveButton) { approveAll(approveButton); return; }
    if (approveArmed) { approveArmed = false; renderApproveAll(); }
    const filterButton = event.target.closest('[data-filter]');
    if (filterButton) {
      filter = filterButton.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button === filterButton));
      render();
      return;
    }
    const card = event.target.closest('[data-post]');
    if (!card) return;
    const post = posts.find((item) => item.id === card.dataset.post);
    const tab = event.target.closest('[data-version]');
    if (tab) {
      card.querySelectorAll('[data-version]').forEach((button) => button.classList.toggle('active', button === tab));
      $('.review-version', card).innerHTML = versionHtml(post.versions[Number(tab.dataset.version)]);
      return;
    }
    const button = event.target.closest('[data-decision],[data-comment]');
    if (!button) return;
    const name = $('#review-name').value.trim();
    if (!name) { toast('Add your name at the top first.'); $('#review-name').focus(); return; }
    const comment = $('textarea', card).value.trim();
    const buttons = card.querySelectorAll('.review-buttons button');
    buttons.forEach((item) => { item.disabled = true; });
    try {
      if (button.dataset.decision) {
        const result = await api({ action: 'decide', postId: post.id, decision: button.dataset.decision, name, comment });
        post.clientStatus = button.dataset.decision;
        toast(button.dataset.decision === 'approved' ? (result.released ? 'Approved. It’s now scheduled.' : 'Approved. Thank you!') : 'Sent to the team. Thank you!');
      } else {
        await api({ action: 'comment', postId: post.id, name, comment });
        toast('Comment sent.');
      }
      post.notes.push({ author: name, body: comment, decision: button.dataset.decision || null });
      render();
    } catch (error) {
      toast(error.message);
      buttons.forEach((item) => { item.disabled = false; });
    }
  });

  // Client portal: Posts (above), Results for the last 30 days, and Send files.
  const number = (value) => (value === null || value === undefined ? '—' : value >= 10000 ? `${Math.round(value / 100) / 10}k` : value.toLocaleString('en-US'));
  let resultsLoaded = false;
  function showPortal(name) {
    document.querySelectorAll('[data-portal]').forEach((tab) => { const on = tab.dataset.portal === name; tab.classList.toggle('active', on); tab.setAttribute('aria-selected', String(on)); });
    ['posts', 'results', 'files'].forEach((key) => { $(`#portal-${key}`).hidden = key !== name; });
    if (name === 'results' && !resultsLoaded) loadResults();
  }
  async function loadResults() {
    resultsLoaded = true;
    try {
      const data = await api({ action: 'results' });
      $('#results-intro').textContent = data.posts ? `The last ${data.days} days on your connected accounts: ${data.posts} post${data.posts === 1 ? '' : 's'}.` : `No posts in the last ${data.days} days yet.`;
      $('#results-grid').innerHTML = data.posts ? [['Posts', data.posts], ['Views', data.views], ['Reached', data.reach], ['Engagements', data.engagements]].map(([label, value]) => `<div class="results-card"><b>${number(value)}</b><small>${label}</small></div>`).join('') + `<p class="results-networks">${data.networks.map((item) => `${escapeHtml(item.network)}: ${item.count}`).join(' · ')}</p>` : '';
      $('#results-top').innerHTML = data.top.length ? `<h2 class="results-heading">Top posts</h2>${data.top.map((post) => `<div class="results-post"><small>${escapeHtml(post.network)} · ${new Date(post.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${number(post.engagements)} engagements</small><p>${escapeHtml(post.text) || '(no caption)'}</p>${post.url ? `<a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">View the post</a>` : ''}</div>`).join('')}` : '';
    } catch (error) { resultsLoaded = false; $('#results-intro').textContent = error.message; }
  }
  document.addEventListener('click', (event) => { const tab = event.target.closest('[data-portal]'); if (tab) showPortal(tab.dataset.portal); });
  $('#files-input').addEventListener('change', (event) => {
    const files = [...event.target.files];
    $('#files-label').textContent = files.length ? `${files.length} file${files.length === 1 ? '' : 's'} chosen: ${files.slice(0, 3).map((file) => file.name).join(', ')}${files.length > 3 ? '…' : ''}` : 'Choose photos or videos';
    $('#files-send').disabled = !files.length;
  });
  $('#files-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const files = [...$('#files-input').files], status = $('#files-status'), button = $('#files-send');
    const name = $('#review-name').value.trim();
    if (!name) { toast('Add your name at the top first.'); $('#review-name').focus(); return; }
    if (!files.length) return;
    if (files.length > 10) { status.textContent = 'Send up to 10 files at a time.'; return; }
    button.disabled = true;
    try {
      status.textContent = 'Getting ready…';
      const { uploads } = await api({ action: 'upload-start', name, note: $('#files-note').value.trim(), files: files.map((file) => ({ name: file.name, type: file.type, size: file.size })) });
      for (const [index, slot] of uploads.entries()) {
        status.textContent = `Sending ${index + 1} of ${uploads.length}…`;
        const response = await fetch(slot.uploadUrl, { method: 'PUT', headers: { 'content-type': files[index].type || 'application/octet-stream', 'x-upsert': 'false' }, body: files[index] });
        if (!response.ok) throw new Error(`${files[index].name} didn’t upload. Try again.`);
      }
      const done = await api({ action: 'upload-done', name, paths: uploads.map((slot) => slot.path) });
      status.textContent = `Sent ${done.arrived} file${done.arrived === 1 ? '' : 's'}. Thank you!`;
      $('#files-form').reset(); $('#files-label').textContent = 'Choose photos or videos';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = !$('#files-input').files.length; }
  });

  (async () => {
    if (!token) {
      $('#review-client').textContent = 'Link incomplete';
      $('#review-intro').textContent = 'This review link is missing its code. Open the full link you were sent.';
      return;
    }
    try {
      const data = await api({ action: 'load', campaign });
      posts = data.posts;
      document.title = `${data.client.name} · Content review`;
      $('#review-client').textContent = data.client.name;
      $('#review-workspace').textContent = `Content review from ${data.workspace}`;
      const logo = $('#review-logo');
      if (data.client.logo) logo.style.backgroundImage = `url("${data.client.logo.replace(/"/g, '%22')}")`;
      else logo.textContent = data.client.initials || data.client.name.slice(0, 2);
      if (/^#[0-9a-f]{6}$/i.test(data.client.color)) logo.style.backgroundColor = data.client.color;
      const waiting = posts.filter((post) => post.status === 'waiting' && post.clientStatus !== 'approved').length;
      $('#review-intro').textContent = `${data.campaign ? `${data.campaign}: ` : ''}${posts.length} upcoming post${posts.length === 1 ? '' : 's'}${data.campaign ? '' : ' in the next 60 days'}${waiting ? `, ${waiting} waiting for your approval` : ''}. This link works until ${new Date(data.expiresAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.`;
      $('#review-filter').hidden = !posts.length;
      render();
      $('#portal-tabs').hidden = Boolean(data.campaign);
      const feed = `${location.origin}/api/review?format=ics&t=${encodeURIComponent(token)}`;
      $('#portal-calendar-link').href = feed.replace(/^https?:/, 'webcal:');
      $('#portal-calendar').hidden = !posts.length;
    } catch (error) {
      $('#review-client').textContent = 'Review unavailable';
      $('#review-intro').textContent = error.message;
    }
  })();
})();
