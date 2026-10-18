// Public link-in-bio page at /b/<slug>.
(async () => {
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const slug = (location.pathname.match(/\/b\/([a-z0-9-]{3,40})\/?$/i) || [])[1] || new URLSearchParams(location.search).get('u') || '';
  try {
    const response = await fetch(`/api/bio?slug=${encodeURIComponent(slug.toLowerCase())}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Page not found.');
    document.title = data.name;
    document.documentElement.style.setProperty('--accent', data.color);
    const logo = $('#bio-logo');
    if (data.logo) logo.style.backgroundImage = `url("${data.logo.replace(/"/g, '%22')}")`;
    else logo.textContent = data.initials;
    $('#bio-name').textContent = data.name;
    $('#bio-headline').textContent = data.headline;
    $('#bio-links').innerHTML = data.links.map((link) => `<a href="${escapeHtml(link.url)}" rel="noopener">${escapeHtml(link.label)}</a>`).join('');
    if (data.recent.length) {
      $('#bio-recent-section').hidden = false;
      $('#bio-recent').innerHTML = data.recent.map((post) => `<a href="${escapeHtml(post.url)}" rel="noopener" title="${escapeHtml(post.title)}">${post.image ? `<img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" loading="lazy">` : escapeHtml(post.title.slice(0, 60))}</a>`).join('');
    }
  } catch (error) {
    $('#bio-name').textContent = 'Page not found';
    $('#bio-headline').textContent = error.message === 'Page not found.' ? 'This link-in-bio page doesn’t exist or was turned off.' : error.message;
    $('#bio-logo').hidden = true;
  }
})();
