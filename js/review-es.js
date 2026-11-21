// Spanish for the client review page, used when the client's brand kit sets "Language on client pages"
// to Español. Text is swapped as the page draws, so the page's own code stays in English.
(() => {
  const PHRASES = {
    'Content review': 'Revisión de contenido', 'Loading…': 'Cargando…', 'Your name': 'Tu nombre', 'So the team knows who reviewed': 'Para que el equipo sepa quién revisó',
    'Posts': 'Publicaciones', 'Results': 'Resultados', 'Send files': 'Enviar archivos', 'Loading upcoming posts…': 'Cargando las próximas publicaciones…',
    'All upcoming': 'Todas las próximas', 'Waiting for you': 'Esperan tu aprobación', 'Add these posts to my calendar': 'Agregar estas publicaciones a mi calendario',
    'Google Calendar, Outlook, or Apple Calendar. It stays up to date.': 'Google Calendar, Outlook o Apple Calendar. Se mantiene al día.',
    'Loading results…': 'Cargando resultados…', 'Send photos or videos for upcoming posts. They go straight to the team’s content library. Up to 10 files at a time, 50 MB each.': 'Envía fotos o videos para las próximas publicaciones. Llegan directo a la biblioteca de contenido del equipo. Hasta 10 archivos a la vez, de 50 MB cada uno.',
    'Choose photos or videos': 'Elegir fotos o videos', 'Note for the team': 'Nota para el equipo', '(optional)': '(opcional)', 'For example: for the fall launch posts': 'Por ejemplo: para las publicaciones del lanzamiento de otoño',
    'You approved': 'Aprobaste', 'Changes requested': 'Cambios solicitados', 'Waiting for your approval': 'Espera tu aprobación', 'Scheduled': 'Programada',
    'Nothing is waiting for your approval.': 'No hay nada esperando tu aprobación.', 'No upcoming posts right now. Check back later.': 'No hay publicaciones próximas por ahora. Vuelve más tarde.',
    'Untitled post': 'Publicación sin título', 'Comments or requested changes (optional for approval)': 'Comentarios o cambios solicitados (opcional para aprobar)',
    '✓ Approve': '✓ Aprobar', 'Request changes': 'Pedir cambios', 'Comment only': 'Solo comentar', 'Add your name at the top first.': 'Primero escribe tu nombre arriba.',
    'Approved. It’s now scheduled.': 'Aprobada. Ya está programada.', 'Approved. Thank you!': 'Aprobada. ¡Gracias!', 'Sent to the team. Thank you!': 'Enviado al equipo. ¡Gracias!',
    'Comment sent.': 'Comentario enviado.', 'Views': 'Vistas', 'Reached': 'Alcance', 'Engagements': 'Interacciones', 'Top posts': 'Mejores publicaciones', 'View the post': 'Ver la publicación',
    'Send up to 10 files at a time.': 'Envía hasta 10 archivos a la vez.', 'Getting ready…': 'Preparando…', 'Link incomplete': 'Enlace incompleto',
    'This review link is missing its code. Open the full link you were sent.': 'A este enlace de revisión le falta su código. Abre el enlace completo que te enviaron.',
    'Review unavailable': 'Revisión no disponible', 'Something went wrong. Try again.': 'Algo salió mal. Inténtalo de nuevo.', 'Comment': 'Comentario', 'Sections': 'Secciones'
  };
  const PATTERNS = [
    [/^Yes, approve all (\d+)$/, 'Sí, aprobar las $1'], [/^Approve all (\d+)$/, 'Aprobar las $1'], [/^Approving… (\d+) of (\d+)$/, 'Aprobando… $1 de $2'],
    [/^Approved (\d+)\. Thank you!$/, '$1 aprobadas. ¡Gracias!'], [/^Approved (\d+)\. One is now scheduled\.$/, '$1 aprobadas. Una ya está programada.'], [/^Approved (\d+)\. (\d+) are now scheduled\.$/, '$1 aprobadas. $2 ya están programadas.'],
    [/^(.*?)(\d+) upcoming posts?( in the next 60 days)?(?:, (\d+) waiting for your approval)?\. This link works until (.+)\.$/, (m, campaign, count, next, waiting, until) => `${campaign}${count} ${count === '1' ? 'publicación próxima' : 'publicaciones próximas'}${next ? ' en los próximos 60 días' : ''}${waiting ? `, ${waiting} ${waiting === '1' ? 'espera' : 'esperan'} tu aprobación` : ''}. Este enlace funciona hasta el ${until}.`],
    [/^The last (\d+) days on your connected accounts: (\d+) posts?\.$/, (m, days, count) => `Los últimos ${days} días en tus cuentas: ${count} ${count === '1' ? 'publicación' : 'publicaciones'}.`],
    [/^No posts in the last (\d+) days yet\.$/, 'Aún no hay publicaciones en los últimos $1 días.'], [/^(\d+) files? chosen: (.*)$/, '$1 elegidos: $2'],
    [/^Sending (\d+) of (\d+)…$/, 'Enviando $1 de $2…'], [/^Sent (\d+) files?\. Thank you!$/, '$1 enviados. ¡Gracias!'], [/^(.+) didn’t upload\. Try again\.$/, '$1 no se subió. Inténtalo de nuevo.'],
    [/^Content review from (.+)$/, 'Revisión de contenido de $1'], [/^(.+) · Content review$/, '$1 · Revisión de contenido'],
    [/^ approved(.*)$/s, ' aprobó$1'], [/^ asked for changes(.*)$/s, ' pidió cambios$1'], [/^ commented(.*)$/s, ' comentó$1'],
    [/^(.+) · (\d+) engagements$/, '$1 · $2 interacciones']
  ];
  function translateText(text) {
    const trimmed = text.trim();
    if (!trimmed) return text;
    if (PHRASES[trimmed]) return text.replace(trimmed, PHRASES[trimmed]);
    for (const [pattern, replacement] of PATTERNS) if (pattern.test(text)) return text.replace(pattern, replacement);
    return text;
  }
  function translate(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) { const next = translateText(node.nodeValue); if (next !== node.nodeValue) node.nodeValue = next; }
    (root.querySelectorAll ? [root, ...root.querySelectorAll('[placeholder],[aria-label]')] : []).forEach((el) => ['placeholder', 'aria-label'].forEach((attr) => { const value = el.getAttribute?.(attr); if (value) { const next = translateText(value); if (next !== value) el.setAttribute(attr, next); } }));
  }
  let observer = null;
  window.reviewLanguage = (language) => {
    if (language !== 'es' || observer) return;
    document.documentElement.lang = 'es';
    translate(document.body);
    document.title = translateText(document.title);
    observer = new MutationObserver((records) => { for (const record of records) { if (record.type === 'characterData') { const next = translateText(record.target.nodeValue); if (next !== record.target.nodeValue) record.target.nodeValue = next; } else record.addedNodes.forEach((node) => (node.nodeType === 3 ? (node.nodeValue = translateText(node.nodeValue)) : node.nodeType === 1 && translate(node))); } });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  window.reviewTranslate = translateText;
})();
