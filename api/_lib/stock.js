const { httpError } = require('./core');

// Stock photos from Unsplash for the Publishing Studio. Unsplash's API terms: show images
// from Unsplash's own URLs (no re-hosting), report each use through the photo's
// download_location, and credit the photographer and Unsplash with links back.
// https://unsplash.com/documentation and https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines

const API = 'https://api.unsplash.com';
const REFERRAL = 'utm_source=signaldesk&utm_medium=referral';
const ORIENTATIONS = new Set(['landscape', 'portrait', 'squarish']);

// The Access Key from the Unsplash app page (UNSPLASH_API_KEY is accepted as another name for it).
function accessKey() {
  return process.env.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_API_KEY || '';
}

function stockConfigured() {
  return Boolean(accessKey());
}

async function unsplash(path) {
  if (!stockConfigured()) throw httpError(503, 'Stock photos aren’t set up. Add UNSPLASH_ACCESS_KEY in Vercel.');
  const response = await fetch(path.startsWith('https://') ? path : `${API}${path}`, {
    headers: { authorization: `Client-ID ${accessKey()}`, 'accept-version': 'v1' },
    signal: AbortSignal.timeout(15000)
  }).catch(() => null);
  if (!response) throw httpError(502, 'Couldn’t reach Unsplash. Try again in a moment.');
  if (response.status === 401) throw httpError(503, 'Unsplash didn’t accept the key. In Vercel, UNSPLASH_ACCESS_KEY (or UNSPLASH_API_KEY) must be the app’s Access Key, not its Secret Key or App ID.');
  if (response.status === 403 || response.status === 429) throw httpError(429, 'Unsplash’s hourly limit was reached. Try again later. Apps in Unsplash’s demo tier get 50 requests an hour; apply for production access to raise it.');
  if (response.status === 404) throw httpError(404, 'That photo is no longer on Unsplash.');
  if (!response.ok) throw httpError(502, `Unsplash returned HTTP ${response.status}.`);
  return response.json();
}

const withReferral = (url) => `${url}${url.includes('?') ? '&' : '?'}${REFERRAL}`;

// A JPEG sized for social networks. Instagram only accepts JPEG.
function publishUrl(photo) {
  const url = new URL(photo.urls.raw);
  url.searchParams.set('fm', 'jpg');
  url.searchParams.set('q', '85');
  url.searchParams.set('w', '2160');
  url.searchParams.set('fit', 'max');
  return url.href;
}

function photoSummary(photo) {
  return {
    id: photo.id, width: photo.width, height: photo.height, color: photo.color || '#ddd',
    alt: String(photo.alt_description || photo.description || '').slice(0, 300),
    thumb: photo.urls.small, preview: photo.urls.regular,
    photographer: photo.user?.name || photo.user?.username || 'Unknown',
    photographerUrl: withReferral(photo.user?.links?.html || 'https://unsplash.com'),
    photoUrl: withReferral(photo.links?.html || 'https://unsplash.com'),
    unsplashUrl: withReferral('https://unsplash.com')
  };
}

async function searchPhotos({ query, page = 1, orientation }) {
  const text = typeof query === 'string' ? query.trim().slice(0, 100) : '';
  if (!text) throw httpError(400, 'Type what you’re looking for.');
  const params = new URLSearchParams({ query: text, page: String(Math.min(20, Math.max(1, parseInt(page, 10) || 1))), per_page: '24', content_filter: 'high' });
  if (ORIENTATIONS.has(orientation)) params.set('orientation', orientation);
  const data = await unsplash(`/search/photos?${params}`);
  return { total: data.total || 0, pages: Math.min(20, data.total_pages || 0), photos: (data.results || []).map(photoSummary) };
}

// Called when someone picks a photo: reports the use to Unsplash and returns the image to post.
async function usePhoto(id) {
  if (typeof id !== 'string' || !/^[\w-]{5,40}$/.test(id)) throw httpError(400, 'Choose a photo.');
  const photo = await unsplash(`/photos/${encodeURIComponent(id)}`);
  const download = photo.links?.download_location;
  if (download && download.startsWith(`${API}/`)) await unsplash(download).catch((error) => console.error('Unsplash download report failed:', error.message));
  return { ...photoSummary(photo), url: publishUrl(photo), credit: `Photo by ${photo.user?.name || photo.user?.username || 'Unknown'} on Unsplash` };
}

module.exports = { stockConfigured, searchPhotos, usePhoto };
