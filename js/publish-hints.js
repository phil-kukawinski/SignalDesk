// Turns a network's error message for a failed post into a plain reason and the fix.
// Shared by the app (post panel, Home) and the server (failure emails), so both say the same thing.
// Returns null when the message isn't one we recognize; callers then show the network's own words.
const PUBLISH_HINT_NAMES={facebook:'Facebook',facebook_story:'Facebook',instagram:'Instagram',instagram_story:'Instagram',threads:'Threads',twitter:'X',linkedin:'LinkedIn',pinterest:'Pinterest',youtube:'YouTube',tiktok:'TikTok'};
const PUBLISH_HINTS=[
  {test:(m,k)=>k==='auth'||/session has been invalidated|access token|token (has )?expired|invalid oauth|reconnect|sign in again|unauthorized|revoked/.test(m),
    why:n=>`SignalDesk’s access to this ${n} account expired or was removed.`,fix:'Reconnect it in Social Accounts, then select Retry.'},
  {test:m=>/trial access|standard access|sandbox/.test(m),
    why:()=>'Pinterest hasn’t approved SignalDesk for live Pins yet.',fix:'Nothing to fix in the post. Once Pinterest approves Standard access, select Retry.'},
  {test:(m,k)=>k==='rate_limit'||/rate limit|too many (requests|calls|posts)|request limit|application request limit|429/.test(m),
    why:n=>`${n} is limiting how often this account can post right now.`,fix:'Wait an hour, then select Retry.'},
  {test:m=>/duplicate|same content|already (been )?posted|identical/.test(m),
    why:n=>`${n} blocked this as a repeat of a recent post.`,fix:'Change the wording a little, then select Retry.'},
  {test:m=>/aspect ratio|2207009/.test(m),
    why:n=>`${n} doesn’t accept this image’s shape.`,fix:'Crop it with Prep image (Instagram takes 4:5 to 1.91:1), then select Retry.'},
  {test:m=>/video/.test(m)&&/duration|too long|length|seconds|2207026/.test(m),
    why:n=>`The video is longer than ${n} allows here.`,fix:'Trim it (Stories take up to 60 seconds), replace it in the post, then select Retry.'},
  {test:m=>/hashtag/.test(m),
    why:n=>`The caption has more hashtags than ${n} allows.`,fix:'Use 30 or fewer hashtags on Instagram, then select Retry.'},
  {test:m=>/(caption|text|message|status|description).{0,40}(too long|exceeds|maximum|limit|characters)|2207010/.test(m),
    why:n=>`The text is longer than ${n} allows.`,fix:'Shorten this network’s copy in the Publishing Studio (the counter shows the limit), then select Retry.'},
  {test:m=>/(could ?n[o’']?t|cannot|failed to|unable to) (be )?(download|fetch|retriev|access)|media (download|fetch)|2207003|2207020|9004/.test(m),
    why:n=>`${n} couldn’t download the image or video.`,fix:'Check the file is still attached and opens in a browser, then select Retry.'},
  {test:m=>/unsupported|not supported|format|codec|2207004|2207005|invalid (image|video|media)/.test(m),
    why:n=>`${n} doesn’t accept this file’s format.`,fix:'Use a JPEG or PNG image, or an MP4 (H.264) video, then select Retry.'},
  {test:m=>/(link|url).{0,30}invalid|invalid.{0,30}(link|url)/.test(m),
    why:n=>`${n} didn’t accept a link in the post.`,fix:'Make sure the link opens in a browser, then select Retry.'},
  {test:m=>/permission|not authori[sz]ed|\(#200\)|\(#10\)|does not have|insufficient|scope/.test(m),
    why:n=>`The ${n} account hasn’t given SignalDesk permission to do this.`,fix:'Reconnect and allow every permission it asks for. For a Facebook Page, you need to be one of its admins.'},
  {test:m=>/spam|restricted|blocked|violat|community (standards|guidelines)/.test(m),
    why:n=>`${n} flagged this post or account.`,fix:'Look for a warning on the account in the app itself, change the post if needed, then select Retry.'},
  {test:(m,k)=>k==='temporary'||/could not reach|took too long|timed? ?out|temporar|try again later|unexpected error|service unavailable|internal error/.test(m),
    why:n=>`${n} didn’t respond properly.`,fix:'This usually clears up on its own. Select Retry in a few minutes.'}
];
function explainPublishError(platform,message,kind){
  const text=String(message||'').toLowerCase();if(!text&&!kind)return null;
  const name=PUBLISH_HINT_NAMES[platform]||'The network';
  const hint=PUBLISH_HINTS.find(item=>item.test(text,kind||''));
  return hint?{why:hint.why(name),fix:hint.fix}:null;
}
/* global module */
if(typeof module==='object'&&module.exports)module.exports={explainPublishError};
