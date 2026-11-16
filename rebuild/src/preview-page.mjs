import {publicConsultationCatalog} from "./domain/public-catalog.mjs";

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,character=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[character]);
}

/**
 * A non-interactive, internal-only representation of the unavailable app.
 * Never exposes configured Stripe prices, Calendly links or customer data.
 */
export function renderEngineeringPreview(catalog=[]){
  let consultations=[];
  try{consultations=publicConsultationCatalog(catalog);}
  catch{/* A missing/unverified catalog must not become an offer. */}
  const cards=consultations.length
    ? consultations.map(({key,title,durationMinutes})=>`<li class="card">
        <h2>${escapeHtml(title)}</h2>
        <p>${durationMinutes} minutes · Currently unavailable</p>
        <a href="/consultations/${encodeURIComponent(key)}" aria-label="View unavailable ${escapeHtml(title)} consultation details">View details</a>
      </li>`).join("")
    : '<li class="card"><h2>Consultation catalog unavailable</h2><p>No verified consultation offerings are published.</p></li>';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Healthwise Support — Engineering Vault Preview</title>
<link rel="stylesheet" href="/preview.css">
</head><body>
<main class="container">
  <p class="eyebrow">Elevate360Official / Internal engineering</p>
  <h1>Healthwise Support</h1>
  <p class="status" role="status">Engineering Vault — Not released</p>
  <p class="lead">This local preview is for application development only. Accounts, consultations, bookings and payments are unavailable.</p>
  <section aria-labelledby="consultations-heading">
    <h2 id="consultations-heading">Consultation catalog</h2>
    <ul class="cards">${cards}</ul>
  </section>
  <p class="note">This service does not offer emergency medical support, diagnosis, or access to a clinician.</p>
</main>
</body></html>`;
}

/**
 * Local-only, informational consultation details. No account, provider URL,
 * Stripe price, booking capability, or payment action is ever emitted.
 * A missing catalog or unknown key yields null so the server returns 404.
 */
export function renderConsultationDetail(catalog=[],key){
  if(!["quick","full","premium"].includes(key))return null;
  let consultation;
  try{consultation=publicConsultationCatalog(catalog).find(item=>item.key===key);}
  catch{return null;}
  if(!consultation)return null;
  const title=escapeHtml(consultation.title);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>${title} — Healthwise Engineering Vault</title>
<link rel="stylesheet" href="/preview.css">
</head><body>
<main class="container">
<p class="eyebrow">Healthwise Support / Internal engineering</p>
<a href="/">Back to preview</a>
<h1>${title}</h1>
<p class="status" role="status">Currently unavailable — Engineering Vault</p>
<p class="lead">Consultation duration: ${consultation.durationMinutes} minutes. Booking, payment and account access are disabled.</p>
<p class="note">This preview does not provide clinical services, medical diagnosis or emergency assistance.</p>
</main>
</body></html>`;
}

export const engineeringPreviewCss=`
:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#0a1427;color:#f5f7fb}
*{box-sizing:border-box}body{margin:0}.container{max-width:900px;margin:0 auto;padding:clamp(28px,6vw,70px) 22px}
.eyebrow{font-size:.78rem;letter-spacing:.13em;text-transform:uppercase;color:#f8c566;font-weight:700}
h1{font-size:clamp(2.4rem,7vw,4.5rem);line-height:1.08;margin:12px 0 20px}
h2{font-size:1.25rem}.lead{color:#c5d2e5;font-size:1.15rem;line-height:1.7;max-width:720px}
.status{display:inline-block;padding:10px 15px;background:#3a2c16;color:#ffe0a2;border:1px solid #926b2a;border-radius:10px;font-weight:700}
section{margin-top:50px}.cards{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:15px}
.card{padding:22px;border:1px solid #3c4b63;border-radius:16px;background:#13223a}
.card a,a{color:#ffcf75;text-underline-offset:4px}.card a:focus-visible,a:focus-visible{outline:2px solid #ffe0a2;outline-offset:4px}
.card h2{margin:0 0 10px}.card p,.note{color:#bed0e6;line-height:1.6}
.note{border-top:1px solid #354762;margin-top:40px;padding-top:25px;font-size:.9rem}
`;
