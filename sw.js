/* ============================================================
   MOI · module privé de Versus
   Lit TON fichier « Portefeuille & Épargne » (son API Apps Script), directement depuis cet appareil.
   Rien de ce module ne passe par le fichier Versus partagé : l'adresse et la clé restent
   dans le stockage local de l'appareil, les chiffres ne sont envoyés à personne.
   Chargé à la demande (premier passage sur l'onglet Moi).
   Dépend des fonctions communes de Versus : eur, pct, esc, sens, ok, tracer, boiteGraphe,
   teinte, couleur, toast, stock, ETAT, MOIS, F0, F1, NB, MOINS, nf, reduit.
   ============================================================ */
(function () {
"use strict";
const K = { api: "versus.moi.api", cle: "versus.moi.cle", cache: "versus.moi.cache", pref: "versus.moi.pref" };
const PREF = Object.assign({ onglet: "cote", tri: "env", mode: "valeur", per: "6m", serie: "ip", moisMode: "pct", rep: "classe", acc: {} },
  (() => { try { return JSON.parse(stock.get(K.pref) || "{}"); } catch (e) { return {}; } })());
function garderPref() { stock.set(K.pref, JSON.stringify(PREF)); }

let M = null;            // dernières données reçues de ton fichier
let SRC = "";            // "api" | "cache"
let enCours = false, dernierAppel = 0, dernierFlap = "", erreur = "";
const ouverts = new Set();   // enveloppes dépliées

/* ---------- Format (complète ceux de Versus) ---------- */
const $m = s => document.querySelector("#v-moi " + s);
function cours(v) { return !ok(v) ? "—" : ETAT.discret === "oui" ? "•••" + NB + "€" : (v < 1 ? nf(4, 4) : nf(2, 2)).format(v) + NB + "€"; }
function qte(v) { return !ok(v) ? "—" : ETAT.discret === "oui" ? "•••" : nf(0, 6).format(v); }
function fleche(v) { const s = sens(v); return s === "up" ? "▲" : s === "down" ? "▼" : "■"; }
function dateNum(n) { const s = String(n); return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); }
function dateCourte(d) { return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); }
function dateLongue(d) { return d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear(); }
function frDate(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""; }
function isoJour(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function kEur(v) { return ETAT.discret === "oui" ? "•••" : (Math.abs(v) >= 1000 ? sgn(v) + F1.format(Math.abs(v) / 1000) + "k" : sgn(Math.round(v)) + F0.format(Math.abs(v))); }
function sgn(v) { return v > 0 ? "+" : v < 0 ? MOINS : ""; }
function maCouleur() { try { return D ? couleur(ETAT.moi) : "var(--p0)"; } catch (e) { return "var(--p0)"; } }

/* ---------- Styles (injectés une fois, tous préfixés par .moi) ---------- */
function injecterStyle() {
  if (document.getElementById("style-moi")) return;
  const st = document.createElement("style"); st.id = "style-moi";
  st.textContent = `
.moi { --s1: var(--mc, var(--p0)); --s2: var(--gold); --s3: var(--accent);
  --flap: #1C222B; --flap-2: #262E39; --flap-ink: #F2F4F7; --flap-line: #0B0E12; --flap-acc: #B8A9FF; }
.moi .m-onglets { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 62px); z-index: 15; box-shadow: 0 6px 10px -6px var(--shade); }
.moi .m-prive { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-3); }
.moi .m-prive b { font: 700 10.5px/1.4 var(--f-display); letter-spacing: .1em; text-transform: uppercase; padding: 1px 7px; border-radius: 4px; background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent-ink); }
.moi .m-hero { display: grid; gap: 10px; }
.moi .m-flaps { display: flex; flex-wrap: wrap; gap: 4px; }
.moi .m-flap { position: relative; width: clamp(26px, 8.4vw, 44px); height: clamp(40px, 12.6vw, 64px); display: grid; place-items: center; border-radius: 6px;
  background: linear-gradient(to bottom, var(--flap-2) 0 50%, var(--flap) 50% 100%); color: var(--flap-ink); font: 600 clamp(22px, 7.4vw, 40px)/1 var(--f-num);
  box-shadow: 0 1px 0 var(--flap-line), 0 4px 10px var(--shade); }
.moi .m-flap::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px; background: var(--flap-line); }
.moi .m-flap.u, .moi .m-flap.s { color: var(--flap-acc); }
.moi .m-flap.sep { width: clamp(6px, 2vw, 10px); background: none; box-shadow: none; } .moi .m-flap.sep::after { display: none; }
.moi .m-flap.go { animation: mBascule .32s cubic-bezier(.3, .7, .3, 1) both; }
@keyframes mBascule { from { transform: rotateX(-88deg); } to { transform: rotateX(0); } }
.moi .m-jour { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; font-size: 13px; color: var(--ink-2); }
.moi .m-status { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--ink-3); }
.moi .m-status i { font-style: normal; display: inline-flex; align-items: center; gap: 6px; }
.moi .m-status i::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); }
.moi .m-status i.on::before { background: var(--up); box-shadow: 0 0 0 3px var(--up-bg); }
.moi .tuiles > .m-def-t { cursor: pointer; }
.moi .tuiles .lab .qm { display: inline-grid; place-items: center; width: 14px; height: 14px; margin-left: 4px; border-radius: 50%; border: 1px solid var(--rule); font: 700 9px/1 var(--f-num); font-style: normal; color: var(--ink-3); vertical-align: 1px; }
.moi .tuiles .m-def { display: none; font-size: 12px; line-height: 1.4; color: var(--ink-2); padding-top: 4px; }
.moi .tuiles .ouvert .m-def { display: block; }
.moi .m-totaux { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); background: var(--flap); color: var(--flap-ink); border-radius: 12px; overflow: hidden; }
.moi .m-totaux button { all: unset; box-sizing: border-box; cursor: pointer; padding: 11px; display: grid; gap: 4px; border-right: 1px solid var(--flap-line); min-width: 0; }
.moi .m-totaux button:last-child { border-right: 0; }
.moi .m-totaux button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.moi .m-totaux .lab { font: 700 10px/1.15 var(--f-display); letter-spacing: .05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; opacity: .72; }
.moi .m-totaux .val { font: 600 15px/1.1 var(--f-num); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.moi .m-totaux .val.acc { color: var(--flap-acc); }
.moi .m-notes { display: grid; gap: 6px; }
.moi .m-note { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; color: var(--ink-2); padding: 9px 12px; border-radius: 10px; background: var(--panel); border: 1px solid var(--rule); }
.moi .m-note .ic { flex: none; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font: 700 11px/1 var(--f-num); }
.moi .m-note.ok .ic { background: var(--up-bg); color: var(--up); }
.moi .m-note.warn { border-color: var(--down); color: var(--ink); } .moi .m-note.warn .ic { background: var(--down-bg); color: var(--down); }
.moi .m-note.rappel .ic { background: color-mix(in srgb, var(--gold) 18%, transparent); color: var(--gold); }
.moi .m-cote { width: 100%; border-collapse: collapse; }
.moi .m-cote th { font: 700 10.5px/1.2 var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); text-align: right; padding: 0 0 7px 8px; white-space: nowrap; }
.moi .m-cote th:first-child { text-align: left; padding-left: 0; }
.moi .m-cote td { padding: 11px 0 11px 8px; border-top: 1px solid var(--rule); text-align: right; vertical-align: middle; font: 500 13px/1.2 var(--f-num); font-variant-numeric: tabular-nums; white-space: nowrap; }
.moi .m-cote td:first-child { text-align: left; padding-left: 0; font-family: var(--f-text); white-space: normal; }
.moi .m-cote td .nm { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; }
.moi .m-cote td .nm::before { content: ""; width: 7px; height: 7px; flex: none; border-right: 2px solid var(--ink-3); border-bottom: 2px solid var(--ink-3); transform: rotate(-45deg); transition: transform .2s; margin-right: 2px; }
.moi .m-cote tr[aria-expanded="true"] td .nm::before { transform: rotate(45deg); }
.moi .m-cote tr.total td .nm::before { display: none; }
.moi .m-cote td .sm { display: block; font-size: 11.5px; color: var(--ink-3); font-family: var(--f-text); }
.moi .m-cote td .sm.r { text-align: right; font-family: var(--f-num); }
.moi .m-cote tr.click { cursor: pointer; }
.moi .m-cote tr.click:hover td { background: var(--panel-2); }
.moi .m-cote tr.total td { border-top: 2px solid var(--ink); font-weight: 600; }
.moi .m-cote tr.m-det > td { padding: 0 0 12px; border-top: 0; white-space: normal; text-align: left; font-family: var(--f-text); }
.moi .m-spark { width: 60px; height: 22px; display: block; margin-left: auto; overflow: visible; }
.moi .mini.quatre { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.moi .mini p { grid-column: 1 / -1; margin: 2px 0 0; font-size: 12px; color: var(--ink-2); }
.moi .m-lignes { display: grid; margin-top: 8px; }
.moi .m-ligne { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 10px 2px; border-top: 1px solid var(--rule-2); cursor: pointer; }
.moi .m-ligne:hover { background: var(--panel-2); }
.moi .m-ligne .code { font: 700 14px/1.1 var(--f-num); letter-spacing: .02em; }
.moi .m-ligne .code .tag { font-style: normal; background: var(--rule-2); color: var(--ink-3); }
.moi .m-ligne .nom { font-size: 12px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.moi .m-ligne .v { text-align: right; font: 600 14px/1.1 var(--f-num); font-variant-numeric: tabular-nums; }
.moi .m-ligne .pv { text-align: right; font: 500 12px/1.25 var(--f-num); font-variant-numeric: tabular-nums; }
.moi .m-ligne .meta { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; font: 400 11.5px/1.3 var(--f-num); color: var(--ink-2); }
.moi .m-ligne .meta .badge { font-size: 11.5px; padding: 1px 7px; }
.moi .m-poids { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) 44px; gap: 8px; align-items: center; }
.moi .m-poids .bar { height: 4px; background: var(--rule-2); border-radius: 2px; overflow: hidden; }
.moi .m-poids .bar i { display: block; height: 100%; background: var(--s1); border-radius: 2px; }
.moi .m-poids span { font: 500 11px/1 var(--f-num); color: var(--ink-3); text-align: right; }
.moi .m-ligne.especes { cursor: default; color: var(--ink-3); } .moi .m-ligne.especes:hover { background: none; }
.moi .m-ligne-det { grid-column: 1 / -1; padding-top: 4px; cursor: default; }
.moi .m-tri { display: flex; justify-content: space-between; align-items: end; gap: 10px; }
.moi .m-tri .sel { min-width: 0; width: min(240px, 60%); }
.moi .m-big { font: 700 clamp(32px, 10vw, 46px)/1 var(--f-num); font-variant-numeric: tabular-nums; letter-spacing: -.03em; }
.moi .m-leg3 { display: grid; }
.moi .m-leg3 button { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 12px minmax(0, 1fr) auto 46px; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--rule); font-size: 13.5px; }
.moi .m-leg3 button i { width: 12px; height: 12px; border-radius: 3px; transform: skewX(-12deg); }
.moi .m-leg3 .num { text-align: right; font-family: var(--f-num); font-variant-numeric: tabular-nums; } .moi .m-leg3 .pc { text-align: right; color: var(--ink-3); font-size: 12.5px; font-family: var(--f-num); }
.moi .m-bloc { position: relative; padding-left: 12px; display: grid; gap: 10px; scroll-margin-top: 130px; }
.moi .m-bloc::before { content: ""; position: absolute; left: 0; top: 2px; bottom: 2px; width: 4px; border-radius: 2px; background: var(--c, var(--rule)); }
.moi .m-bloc h2.sec { border-bottom-color: var(--c, var(--rule)); }
.moi h3.m-sous { margin: 6px 0 0; font: italic 800 14px/1 var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); }
.moi .m-liste { display: grid; }
.moi .m-liste .r { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; padding: 10px 0; border-bottom: 1px solid var(--rule); }
.moi .m-liste .r .a { font-weight: 600; font-size: 14px; min-width: 0; }
.moi .m-liste .r .b { text-align: right; font: 600 14px/1.2 var(--f-num); font-variant-numeric: tabular-nums; }
.moi .m-liste .r .c { font-size: 12px; color: var(--ink-3); min-width: 0; }
.moi .m-liste .r .d { text-align: right; font: 400 12px/1.2 var(--f-num); color: var(--ink-2); }
.moi .m-liste .r.total { border-top: 2px solid var(--c, var(--ink)); }
.moi .m-liste .r.total .a { font: italic 800 14px/1.2 var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
.moi .m-pret { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: 12px; overflow: hidden; }
.moi .m-pret div { background: var(--panel); padding: 10px 12px; display: grid; gap: 3px; min-width: 0; }
.moi .m-pret span { font-size: 11.5px; color: var(--ink-3); }
.moi .m-pret b { font: 600 15px/1.15 var(--f-num); font-variant-numeric: tabular-nums; }
.moi .m-pret small { font-size: 11.5px; color: var(--ink-2); }
.moi .m-barres svg { width: 100%; display: block; }
.moi .m-barres text { font: 500 10.5px var(--f-num); fill: var(--ink-3); }
.moi .legend i.carre { width: 10px; height: 10px; border: 0; border-radius: 2px; display: inline-block; margin-right: 6px; vertical-align: -1px; transform: skewX(-12deg); }
.moi .m-rep { display: grid; }
.moi .m-rep > div { display: grid; grid-template-columns: minmax(64px, 28%) minmax(0, 1fr) 46px 72px; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--rule); font-size: 13px; }
.moi .m-rep .n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.moi .m-rep .b { height: 8px; background: var(--rule-2); border-radius: 4px; overflow: hidden; }
.moi .m-rep .b i { display: block; height: 100%; background: var(--s1); border-radius: 4px; }
.moi .m-rep .p, .moi .m-rep .e { text-align: right; font: 500 12px/1 var(--f-num); font-variant-numeric: tabular-nums; } .moi .m-rep .e { color: var(--ink-3); }
.moi .grille td.m-c { cursor: pointer; min-width: 46px; height: 34px; font-size: 11px; }
.moi .grille td.m-c.sel { box-shadow: inset 0 0 0 2px var(--ink); }
.moi .m-jr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.moi .m-jr b { display: block; font: 700 12px/1 var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2); margin-bottom: 4px; }
.moi .m-jr .l { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 8px; padding: 5px 0; border-bottom: 1px solid var(--rule-2); font-size: 12px; }
.moi .m-jr .l span:first-child { grid-column: 1 / -1; color: var(--ink-2); }
.moi .m-jr .l span:not(:first-child) { font: 500 11.5px/1.2 var(--f-num); white-space: nowrap; }
.moi .m-jr .l span:last-child { text-align: right; }
.moi .acc > div { display: grid; gap: 10px; }
.moi .m-vide { display: grid; gap: 14px; justify-items: start; padding: 26px 0 10px; }
.moi .m-vide p { margin: 0; font-size: 14px; color: var(--ink-2); }
.moi .tab td small { color: var(--ink-3); }
@media (max-width: 430px) {
  .moi .mini.quatre { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .moi .m-cote td { font-size: 12px; padding-left: 6px; } .moi .m-cote th { padding-left: 6px; }
  .moi .m-cote td .nm { font-size: 13px; } .moi .m-spark { width: 40px; }
  .moi .m-rep > div { grid-template-columns: minmax(60px, 26%) minmax(0, 1fr) 44px 66px; }
}
@media (max-width: 360px) { .moi .m-cote .c-spark { display: none; } .moi .m-totaux .val { font-size: 13px; } }
@media (prefers-reduced-motion: reduce) { .moi .m-flap.go { animation: none; } }
`;
  document.head.appendChild(st);
}

/* ---------- Connexion à ton fichier ---------- */
function adresse() { return (stock.get(K.api) || "").trim(); }
function cle() { return stock.get(K.cle) || ""; }
function configure() { return !!(adresse() && cle()); }
function lireCache() { if (M) return; const c = stock.get(K.cache); if (c) { try { M = JSON.parse(c); SRC = "cache"; } catch (e) { stock.del(K.cache); } } }

async function charger(frais) {
  if (!configure() || enCours) return;
  enCours = true; erreur = "";
  const ctrl = window.AbortController ? new AbortController() : null;
  const minuteur = setTimeout(() => { if (ctrl) ctrl.abort(); }, 25000);
  try {
    const url = adresse();
    const rep = await fetch(url + (url.includes("?") ? "&" : "?") + "action=data&cle=" + encodeURIComponent(cle()) + (frais ? "&frais=1" : ""), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
    const json = await rep.json();
    if (!json.ok) {
      if (json.erreur === "cle") { stock.del(K.cle); erreur = json.message || "Clé refusée par ton fichier."; return; }
      throw new Error(json.message || "Réponse inattendue de ton fichier");
    }
    M = json; SRC = "api"; dernierAppel = Date.now();
    stock.set(K.cache, JSON.stringify(json));
  } catch (e) {
    erreur = e && e.name === "AbortError" ? "Ton fichier met trop de temps à répondre." : (e && e.message) || String(e);
    if (M) SRC = "cache";
  } finally {
    clearTimeout(minuteur); enCours = false;
    if (vueMoi()) rendre();
  }
}
function vueMoi() { const s = document.getElementById("v-moi"); return s && !s.hidden; }

/* ---------- Rendu ---------- */
const ONGLETS = [["cote", "Cote"], ["patrimoine", "Patrimoine"], ["stats", "Stats"]];

function rendre() {
  injecterStyle();
  const v = document.getElementById("v-moi"); if (!v) return;
  v.style.setProperty("--mc", maCouleur());
  if (!configure()) { v.innerHTML = ecranConnexion(); brancherConnexion(v); return; }
  lireCache();
  if (!M) {
    v.innerHTML = erreur ? '<div class="m-vide"><p>Impossible de lire ton fichier.</p><p class="info">' + esc(erreur) + '</p><button class="btn" type="button" id="m-reessayer">Réessayer</button></div>'
      : '<div class="m-vide"><div class="m-flaps" aria-hidden="true">' + flaps("MOI", !reduit) + "</div><p>Ouverture de ton fichier…</p><p class=\"info\">La première lecture prend quelques secondes. Ensuite, les derniers chiffres s'affichent tout de suite pendant la mise à jour.</p></div>";
    const r = v.querySelector("#m-reessayer"); if (r) r.addEventListener("click", () => { erreur = ""; rendre(); charger(true); });
    if (!erreur) charger(false);
    return;
  }
  if (Date.now() - dernierAppel > 5 * 60e3 && !enCours && !erreur) setTimeout(() => charger(false), 0);
  const o = ONGLETS.some(x => x[0] === PREF.onglet) ? PREF.onglet : "cote";
  const bandeau = SRC === "cache" ? '<div class="demo-band">' + (enCours ? "Mise à jour de ton fichier…" : erreur ? "Ton fichier n'a pas répondu (" + esc(erreur) + ") · chiffres de la dernière ouverture." : "Chiffres de la dernière ouverture · mise à jour…") + " <small>" + esc(M.majTexte || "") + "</small></div>" : "";
  v.innerHTML =
    '<div class="seg m-onglets" role="tablist" aria-label="Moi">' + ONGLETS.map(([k, l]) => '<button type="button" role="tab" data-m-ong="' + k + '" aria-pressed="' + (o === k) + '" aria-selected="' + (o === k) + '">' + l + "</button>").join("") + "</div>" +
    bandeau +
    '<div class="m-prive"><b>Privé</b><span>Lu depuis ton fichier, visible seulement sur cet appareil' + (M.majTexte ? " · " + esc(M.majTexte.replace(/^Cours du /, "").replace(/\s*\(.*\)$/, "")) : "") + "</span></div>" +
    ({ cote: htmlCote, patrimoine: htmlPatrimoine, stats: htmlStats })[o]();
  v.querySelectorAll("[data-m-ong]").forEach(b => b.addEventListener("click", () => { PREF.onglet = b.dataset.mOng; garderPref(); rendre(); window.scrollTo(0, 0); }));
  v.querySelectorAll("details.acc[data-acc]").forEach(d => d.addEventListener("toggle", () => { PREF.acc[d.dataset.acc] = d.open; garderPref(); if (d.open && d.dataset.acc === "m-courbe") dessinerCourbe(); }));
  ({ cote: brancherCote, patrimoine: brancherPatrimoine, stats: brancherStats })[o](v);
}

function acc(id, titre, sous, contenu, defaut) {
  const ouvert = PREF.acc[id] === undefined ? !!defaut : PREF.acc[id];
  return '<details class="acc" data-acc="' + id + '"' + (ouvert ? " open" : "") + '><summary><span class="t">' + titre + (sous ? " <small>" + sous + "</small>" : "") + "</span></summary><div>" + contenu + "</div></details>";
}

function ecranConnexion() {
  return '<div class="m-vide"><div class="m-flaps" aria-hidden="true">' + flaps("MOI", false) + "</div>" +
    "<p>Ton espace privé : tes enveloppes, tes lignes, ton épargne, ton immobilier et tes stats détaillées, lus directement depuis ton fichier « Portefeuille &amp; Épargne ».</p>" +
    '<p class="info">Connecte-le une fois dans Réglages › Mon fichier : l\'adresse et la clé restent sur cet appareil et ne passent jamais par le fichier Versus partagé. Les autres ne voient que ta bourse dans le classement.</p>' +
    '<button class="btn acc" type="button" id="m-connecter">Connecter mon fichier</button></div>';
}
function brancherConnexion(v) {
  const b = v.querySelector("#m-connecter");
  if (b) b.addEventListener("click", () => { if (typeof ouvrirReglages === "function") ouvrirReglages("regl-moi"); });
}

/* Afficheur à palettes (repris de Cote) */
function flaps(texte, animer) {
  let i = 0;
  return Array.from(texte).map(ch => {
    if (ch === NB || ch === " " || ch === " ") return '<span class="m-flap sep" aria-hidden="true"></span>';
    const cls = ch === "€" ? "m-flap u" : (ch === MOINS || ch === "+") ? "m-flap s" : "m-flap";
    const delai = animer ? ' style="animation-delay:' + (i++ * 55) + 'ms"' : "";
    return '<span class="' + cls + (animer ? " go" : "") + '"' + delai + ' aria-hidden="true">' + esc(ch) + "</span>";
  }).join("");
}
function marches(txt) {
  if (!txt) return "";
  return txt.split("·").map(p => p.trim()).filter(Boolean).map(p => {
    const on = p.includes("🟢") || /continu/.test(p);
    return '<i class="' + (on ? "on" : "") + '">' + esc(p.replace(/[🟢⚪🌙]/gu, "").replace(/\s+/g, " ").trim()) + "</i>";
  }).join("");
}
function note(txt, type) {
  if (!txt) return "";
  const propre = txt.replace(/^[✓⚠🔔✏️\s]+/u, "").trim();
  return '<div class="m-note ' + type + '"><span class="ic">' + (type === "ok" ? "✓" : type === "warn" ? "!" : "◷") + "</span><span>" + esc(propre).replace(/ +▸ /g, "<br>▸ ") + "</span></div>";
}
function serieIndice(nom) {
  const h = M.historique; if (!h || !h.rows || !h.rows.length) return null;
  const col = /^Portefeuille/.test(nom) ? "ip" : /PEA/.test(nom) ? "pea" : /CTO/.test(nom) ? "cto" : /^AV/.test(nom) ? "av" : /Crypto/i.test(nom) ? "cr" : null;
  const k = col ? h.cols.indexOf(col) : -1; if (k < 0) return null;
  return h.rows.slice(-64).map(r => r[k]).filter(x => ok(x));
}
function sparkline(vals) {
  if (!vals || vals.length < 2) return "";
  const w = 60, hgt = 22, mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => [i / (vals.length - 1) * w, hgt - 2 - (v - mn) / r * (hgt - 4)]);
  const s = sens(vals[vals.length - 1] - vals[0]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  const last = pts[pts.length - 1];
  return '<svg class="m-spark" viewBox="0 0 ' + w + " " + hgt + '" aria-hidden="true"><path d="' + d + '" fill="none" style="stroke:var(--ink-3)" stroke-width="1.4" stroke-linejoin="round"/><circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.6" style="fill:var(--' + (s === "flat" ? "ink-3" : s) + ')"/></svg>';
}
function tuile(lab, val, cls, sub, def) {
  return '<div' + (def ? ' class="m-def-t" role="button" tabindex="0" aria-expanded="false"' : "") + '><span class="lab">' + lab + (def ? '<i class="qm" aria-hidden="true">?</i>' : "") + '</span><span class="val ' + (cls || "") + '">' + val + '</span><span class="sub">' + (sub || "&nbsp;") + "</span>" + (def ? '<span class="m-def">' + esc(def) + "</span>" : "") + "</div>";
}
function brancherDefs(v) {
  v.querySelectorAll(".m-def-t").forEach(t => {
    const f = () => { t.classList.toggle("ouvert"); t.setAttribute("aria-expanded", t.classList.contains("ouvert")); };
    t.addEventListener("click", f); t.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f(); } });
  });
}

/* ================= Onglet Cote : valeur du jour, enveloppes et leurs lignes ================= */
function patrimoineNet() {
  const imm = M.immo || [], s = M.synthese || {};
  const l = imm.find(x => /^Patrimoine net/.test(x.nom));
  return l ? { avecImmo: true, montant: l.montant, note: l.note } : { avecImmo: false, montant: s.financier, note: "" };
}
function htmlCote() {
  const s = M.synthese || {};
  const net = patrimoineNet();
  const texteFlap = ETAT.discret === "oui" ? "•••" + NB + "€" : eur(s.valeur);
  const animer = !reduit && texteFlap !== dernierFlap; dernierFlap = texteFlap;
  const suffixe = (s.jourLibelle || "").replace(/^Variation du jour\s*·?\s*/, "");
  const envs = (M.enveloppes || []).filter(e => e.type !== "indice");
  const alertes = alertesDeclenchees();
  const tri = PREF.tri || "env";
  const lignesEnv = nom => { const g = (M.groupes || []).find(x => x.env === nom); return g ? g.lignes : []; };
  const rang = (e, i) => {
    const total = e.type === "total", ouvert = ouverts.has(total ? "__total" : e.nom);
    let h = '<tr class="click' + (total ? " total" : "") + '" data-i="' + i + '" tabindex="0" aria-expanded="' + ouvert + '">' +
      '<td><span class="nm">' + esc(e.nom) + '</span><span class="sm">' + (total ? "Toutes enveloppes" : "TWR " + pct(e.twr)) + "</span></td>" +
      "<td>" + eur(e.valeur) + "</td>" +
      '<td class="' + sens(e.jourPct) + '">' + pct(e.jourPct, 2) + "</td>" +
      '<td class="' + sens(e.gain) + '">' + eur(e.gain, 0, true) + '<span class="sm r">' + pct(e.gainPct) + "</span></td>" +
      '<td class="c-spark">' + sparkline(serieIndice(e.nom)) + "</td></tr>";
    if (ouvert) h += detailEnv(e, total ? [] : lignesEnv(e.nom));
    return h;
  };
  return '<div class="m-hero">' +
      '<span class="eyebrow">Valeur du portefeuille</span>' +
      '<div class="m-flaps" role="img" aria-label="' + esc(texteFlap) + '">' + flaps(texteFlap, animer) + "</div>" +
      '<div class="m-jour"><span class="badge ' + sens(s.jour) + '">' + fleche(s.jour) + " " + eur(s.jour, 0, true) + " <small>" + pct(s.jourPct, 2) + "</small></span><span>aujourd'hui" + (suffixe ? " · " + esc(suffixe) : "") + "</span></div>" +
      '<div class="m-status">' + marches(M.marches) + "</div>" +
    "</div>" +
    '<div class="tuiles">' +
      tuile("Résultat total", eur(s.gain, 0, true), sens(s.gain), pct(s.gainPct) + " des apports · frais inclus", "Valeur actuelle moins apports nets : ce que tes placements t'ont rapporté ou coûté au total, frais compris, ventes comprises.") +
      tuile("Rendement investisseur (MWR)", pct(s.mwr), sens(s.mwr), "Timing des apports : <b>" + esc(s.timing || "—") + "</b>", "Rendement de ton argent en tenant compte des dates et montants de tes versements. Non annualisé avant un an de recul.") +
      tuile("Plus-value latente", eur(s.latente, 0, true), sens(s.latente), pct(s.latentePct) + " sur les lignes ouvertes", "Écart entre la valeur des lignes encore détenues et leur prix de revient. Elle devient « réalisée » quand tu vends.") +
      tuile("Performance (TWR)", pct(s.twr), sens(s.twr), "S&amp;P 500 même durée <b>" + pct(s.sp500) + "</b>", "Performance des placements eux-mêmes, sans l'effet de tes versements : c'est elle qu'on compare au S&P 500. Elle garde la trace des pertes faites quand le portefeuille était petit.") +
    "</div>" +
    '<div class="m-totaux">' +
      '<button type="button" data-m-aller="patrimoine"><span class="lab">Apports nets</span><span class="val">' + eur(s.apports) + "</span></button>" +
      '<button type="button" data-m-aller="patrimoine"><span class="lab">Financier</span><span class="val">' + eur(s.financier) + "</span></button>" +
      '<button type="button" data-m-aller="patrimoine"><span class="lab">' + (net.avecImmo ? "Patrimoine net" : "Épargne") + '</span><span class="val acc">' + eur(net.avecImmo ? net.montant : s.epargne) + "</span></button>" +
    "</div>" +
    '<div class="m-notes">' + alertes.map(t => note(t, "warn")).join("") +
      note(M.anomalies, /^✓/.test(M.anomalies || "") ? "ok" : "warn") +
      note(M.rappel, /À mettre à jour/.test(M.rappel || "") ? "warn" : "rappel") + "</div>" +
    "<div>" +
      '<h2 class="sec">Mes enveloppes <small>touche une enveloppe pour ses lignes</small></h2>' +
      '<div class="m-tri"><span class="info">' + (tri === "env" ? "Lignes rangées sous chaque enveloppe." : "Toutes les lignes classées plus bas.") + "</span>" +
        '<label class="sel"><span>Lignes</span><select id="m-tri">' + [["env", "Par enveloppe"], ["poids", "Par poids"], ["jour", "Par variation du jour"], ["pv", "Par plus-value"]].map(([k, l]) => '<option value="' + k + '"' + (tri === k ? " selected" : "") + ">" + l + "</option>").join("") + "</select></label></div>" +
      '<div class="scroll-x"><table class="m-cote"><thead><tr><th>Enveloppe</th><th>Valeur</th><th>Jour</th><th>Résultat</th><th class="c-spark">3 mois</th></tr></thead><tbody>' + envs.map(rang).join("") + "</tbody></table></div>" +
    "</div>" +
    (tri !== "env" ? toutesLignes(tri) : "");
}
function detailEnv(e, lignes) {
  const m = (l, v) => "<div><span>" + l + '</span><b class="' + sens(v) + '">' + pct(v) + "</b></div>";
  const debut = e.debut ? dateLongue(new Date(e.debut + "T12:00:00")) : "—";
  const tri = PREF.tri || "env";
  return '<tr class="m-det"><td colspan="5"><div class="mini quatre">' +
    m("1 semaine", e.s1) + m("1 mois", e.m1) + m("6 mois", e.m6) + m("Depuis janv.", e.ytd) +
    m("1 an", e.a1) + m("TWR", e.twr) + m("MWR", e.mwr) +
    "<div><span>Volatilité 1 an</span><b>" + pct(e.vol, 1, false) + "</b></div>" +
    "<p>" + esc(e.lecture || "") + (e.lecture ? " · " : "") + "suivi depuis le " + debut + "</p></div>" +
    (tri === "env" && lignes.length ? '<div class="m-lignes">' + lignes.map(l => ligneHtml(Object.assign({ env: e.nom }, l))).join("") + "</div>" : "") +
    "</td></tr>";
}
function toutesLignes(tri) {
  const toutes = [];
  (M.groupes || []).forEach(g => g.lignes.forEach(l => { if (!l.especes) toutes.push(Object.assign({ env: g.env }, l)); }));
  const cle = { poids: l => -(l.poids || 0), jour: l => -(l.pct || 0), pv: l => -(l.pvPct || 0) }[tri];
  toutes.sort((a, b) => cle(a) - cle(b));
  return '<div><h2 class="sec">Toutes les lignes <small>' + toutes.length + " lignes</small></h2>" +
    '<div class="m-lignes">' + toutes.map(l => ligneHtml(l, true)).join("") + "</div></div>";
}
function ligneHtml(l, avecEnv) {
  if (l.especes) return '<div class="m-ligne especes"><div class="code">Espèces</div><div class="v">' + eur(l.valeur) + "</div></div>";
  const poids = Math.max(0, Math.min(1, l.poids || 0));
  return '<div class="m-ligne" role="button" tabindex="0" aria-expanded="false" data-code="' + esc(l.code) + '" data-env="' + esc(l.env) + '">' +
    '<div style="min-width:0"><div class="code">' + esc(l.code) + (avecEnv ? '<span class="tag">' + esc(String(l.env).split(" ")[0]) + "</span>" : "") + '</div><div class="nom">' + esc(l.nom || "") + "</div></div>" +
    '<div><div class="v">' + eur(l.valeur) + '</div><div class="pv ' + sens(l.pv) + '">' + eur(l.pv, 0, true) + " · " + pct(l.pvPct) + "</div></div>" +
    '<div class="meta"><span>' + cours(l.cours) + '</span><span class="badge ' + sens(l.pct) + '">' + fleche(l.pct) + " " + pct(l.pct, 2) + "</span>" +
      '<span class="muted">' + qte(l.qte) + " × PRU " + cours(l.pru) + "</span></div>" +
    '<div class="m-poids"><div class="bar"><i style="width:' + (poids * 100).toFixed(1) + '%"></i></div><span>' + pct(poids, 1, false) + "</span></div>" +
    "</div>";
}
function basculerLigne(el) {
  const ouvert = el.querySelector(".m-ligne-det");
  if (ouvert) { ouvert.remove(); el.setAttribute("aria-expanded", "false"); return; }
  const env = el.dataset.env, code = el.dataset.code;
  const p = (M.perfLignes || {})[env + "|" + code] || {};
  const pos = (((M.ref || {}).detenu) || []).find(d => d.env === env && d.code === code) || {};
  const m = (l, v) => "<div><span>" + l + '</span><b class="' + sens(v) + '">' + pct(v) + "</b></div>";
  const e = (l, v, sig) => "<div><span>" + l + '</span><b class="' + (sig ? sens(v) : "") + '">' + (ok(v) ? eur(v, 2, sig) : "—") + "</b></div>";
  const d = document.createElement("div");
  d.className = "m-ligne-det";
  d.innerHTML = '<div class="mini">' + m("1 semaine", p.s1) + m("1 mois", p.m1) + m("6 mois", p.m6) + m("Depuis janv.", p.ytd) + m("1 an", p.a1) +
    e("Coût de revient", pos.cout) + e("Plus-value réalisée", pos.pvr, true) + e("Frais payés", pos.frais) +
    '<p style="grid-column:1/-1;margin:0;font-size:12px;color:var(--ink-2)">' + (p.ticker ? "Performance du cours (" + esc(p.ticker) + "), indépendante de tes dates d'achat." : "Pas de cotation Google Finance pour cette ligne : performances du cours indisponibles.") + "</p></div>";
  el.appendChild(d);
  el.setAttribute("aria-expanded", "true");
}
function alertesDeclenchees() {
  const r = M.ref || {}, out = [];
  (M.alertes || []).forEach(a => {
    let c = (r.cours || {})[a.code];
    (M.groupes || []).forEach(g => g.lignes.forEach(l => { if (l.code === a.code && l.cours) c = l.cours; }));
    if (c && (a.sens === "sous" ? c < a.seuil : c > a.seuil)) out.push(a.code + (a.sens === "sous" ? " est passé sous " : " a dépassé ") + cours(a.seuil) + " (cours " + cours(c) + ")");
  });
  return out;
}
function brancherCote(v) {
  brancherDefs(v);
  const envs = (M.enveloppes || []).filter(e => e.type !== "indice");
  v.querySelectorAll(".m-cote tr.click").forEach(tr => {
    const f = () => { const e = envs[+tr.dataset.i]; const k = e.type === "total" ? "__total" : e.nom; if (ouverts.has(k)) ouverts.delete(k); else ouverts.add(k); rendre(); };
    tr.addEventListener("click", f);
    tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f(); } });
  });
  v.querySelectorAll(".m-ligne[data-code]").forEach(el => {
    el.addEventListener("click", e => { if (!e.target.closest(".m-ligne-det")) basculerLigne(el); });
    el.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target === el) { e.preventDefault(); basculerLigne(el); } });
  });
  const t = v.querySelector("#m-tri"); if (t) t.addEventListener("change", () => { PREF.tri = t.value; garderPref(); rendre(); });
  v.querySelectorAll("[data-m-aller]").forEach(b => b.addEventListener("click", () => { PREF.onglet = b.dataset.mAller; garderPref(); rendre(); window.scrollTo(0, 0); }));
}

/* ================= Onglet Patrimoine ================= */
function htmlPatrimoine() {
  const s = M.synthese || {}, imm = M.immo || [], ep = M.epargne || [], sup = M.supports || [], fis = M.fiscalite || [];
  const net = patrimoineNet();
  const immoNet = (imm.find(x => /^Valeur nette/.test(x.nom)) || {}).montant || 0;
  const parts = [["Bourse", s.valeur || 0, "--s1", "p-bourse"], ["Épargne", s.epargne || 0, "--s2", "p-epargne"]].concat(net.avecImmo ? [["Immobilier net", immoNet, "--s3", "p-immo"]] : []);
  const tot = parts.reduce((a, p) => a + Math.max(0, p[1]), 0) || 1;
  const envs = (M.enveloppes || []).filter(e => e.type === "env");
  const liste = (rows, f) => '<div class="m-liste">' + rows.map(f).join("") + "</div>";
  const rEnv = e => '<div class="r"><span class="a">' + esc(e.nom) + '</span><span class="b">' + eur(e.valeur) + "</span>" +
    '<span class="c">Résultat ' + pct(e.gainPct) + " · TWR " + pct(e.twr) + '</span><span class="d ' + sens(e.gain) + '">' + eur(e.gain, 0, true) + "</span></div>";
  const rEp = r => { const t = /^Total/.test(r.nom);
    return '<div class="r' + (t ? " total" : "") + '"><span class="a">' + esc(r.nom) + '</span><span class="b">' + eur(r.solde) + "</span>" +
      '<span class="c">' + (t ? "Intérêts acquis " + eur(r.acquis) : "Taux moyen " + pct(r.taux, 2, false) + (r.fiscal && r.fiscal !== "—" ? " · fiscalité allégée le " + esc(r.fiscal) : "")) + "</span>" +
      '<span class="d">fin d\'année ≈ ' + eur(r.fin31) + "</span></div>"; };
  const rSup = r => { const t = /^Total/.test(r.nom);
    return '<div class="r' + (t ? " total" : "") + '"><span class="a">' + esc(r.nom) + '</span><span class="b">' + eur(r.valeur) + "</span>" +
      '<span class="c">' + (r.note ? esc(r.note) : "Investi " + eur(r.investi)) + '</span><span class="d ' + sens(r.pv) + '">' + eur(r.pv, 2, true) + " · " + pct(r.pvPct, 2) + "</span></div>"; };
  const rImm = r => { const t = /^Patrimoine net/.test(r.nom);
    return '<div class="r' + (t ? " total" : "") + '"><span class="a">' + esc(r.nom) + '</span><span class="b">' + eur(r.montant) + "</span>" +
      (r.note ? '<span class="c" style="grid-column:1/-1">' + esc(r.note) + "</span>" : "") + "</div>"; };
  const rFis = r => { const t = r.nom === "Portefeuille";
    return '<div class="r' + (t ? " total" : "") + '"><span class="a">' + esc(r.nom) + '</span><span class="b ' + sens(r.gainNet) + '">' + eur(r.gainNet, 0, true) + "</span>" +
      '<span class="c">' + (r.fiscal && r.fiscal !== "—" ? "Fiscalité allégée le " + esc(r.fiscal) : t ? "Après impôt estimé" : "Pas d'avantage fiscal de durée") + '</span><span class="d">impôt ≈ ' + eur(r.impot) + "</span></div>"; };
  const bloc = (id, c, titre, sous, contenu) => '<section class="m-bloc" id="' + id + '" style="--c:var(' + c + ')"><h2 class="sec">' + titre + " <small>" + sous + "</small></h2>" + contenu + "</section>";
  const aBarres = seriePatrimoine().length > 1;
  return '<div class="hero"><span class="eyebrow">' + (net.avecImmo ? "Patrimoine net (avec immobilier)" : "Patrimoine financier") + '</span><span class="m-big">' + eur(net.montant) + '</span><div class="sous">' + esc(net.note || "") + "</div></div>" +
    '<div><div class="stack" role="img" aria-label="Répartition du patrimoine">' + parts.map(p => '<i style="flex:' + Math.max(p[1], 0) + ";background:var(" + p[2] + ')"></i>').join("") + "</div>" +
      '<div class="m-leg3">' + parts.map(p => '<button type="button" data-cible="' + p[3] + '"><i style="background:var(' + p[2] + ')"></i><span>' + p[0] + '</span><span class="num">' + eur(p[1]) + '</span><span class="pc">' + pct(p[1] / tot, 0, false) + "</span></button>").join("") + "</div></div>" +
    (aBarres ? '<div><h2 class="sec">Mois par mois <small>fin de mois, empilé</small></h2><div class="chart-box m-barres"><div class="legend" id="m-leg-patri"></div><svg id="m-barres" role="img" aria-label="Patrimoine mois par mois"></svg></div><p class="resume" id="m-patri-sel"></p></div>' : "") +
    bloc("p-bourse", "--s1", "Bourse", "portefeuille", liste(envs, rEnv)) +
    bloc("p-epargne", "--s2", "Épargne", esc(s.epargneLibelle || ""), liste(ep, rEp) + (sup.length ? '<h3 class="m-sous">Assurance-vie · supports</h3>' + liste(sup, rSup) : "")) +
    (net.avecImmo ? bloc("p-immo", "--s3", "Immobilier", "prix d'achat, prêts restants", pretHtml() + liste(imm, rImm)) : "") +
    (fis.length ? acc("m-fis", "Si tout était retiré", "résultat net d'impôt estimé", liste(fis, rFis), false) : "");
}
function pretHtml() {
  const p = M.prets;
  if (!p || (!p.prochaine && !p.actuel)) return "";
  const cell = (lab, val, sous) => "<div><span>" + lab + "</span><b>" + val + "</b>" + (sous ? "<small>" + sous + "</small>" : "") + "</div>";
  return '<div class="m-pret">' +
    (p.prochaine ? cell("Prochaine échéance", eur(p.prochaine.echeance, 2), "le " + frDate(p.prochaine.date) + " · hors assurance") : "") +
    (p.actuel ? cell("Capital restant dû", eur(p.actuel.restant), "après l'échéance du " + frDate(p.actuel.date)) : "") +
    cell("Intérêts payés en " + new Date().getFullYear(), eur(p.interetsAnnee), "prêt classique") +
    (p.fin ? cell("Fin des prêts", frDate(p.fin), p.interetsRestants ? "encore " + eur(p.interetsRestants) + " d'intérêts" : "") : (p.prochaine ? cell("Après la prochaine", eur(p.prochaine.restant), "restant dû") : "")) +
    "</div>";
}
function seriePatrimoine() {
  const mpm = M.moisParMois || [];
  const app = (M.parametres || {}).appart || null;
  const mens = (M.prets || {}).mensuel || [];
  const MOISN = { "janv.": 1, "févr.": 2, "mars": 3, "avr.": 4, "mai": 5, "juin": 6, "juil.": 7, "août": 8, "sept.": 9, "oct.": 10, "nov.": 11, "déc.": 12 };
  return mpm.map(r => {
    let an, mo;
    if (/^\d{4}-\d{2}/.test(String(r.mois))) { an = +String(r.mois).slice(0, 4); mo = +String(r.mois).slice(5, 7); }
    else { const p = String(r.mois).split(" "); mo = MOISN[p[0]]; an = +p[1]; }
    if (!an || !mo) return null;
    const finIso = isoJour(new Date(an, mo, 0));
    let immo = 0;
    if (app && app.prix && app.date && finIso >= app.date) {
      let restant = null;
      mens.forEach(x => { if (x[0] <= finIso) restant = x[1]; });
      if (mens.length) immo = app.prix - (restant === null ? mens[0][1] : restant);
      else immo = ((M.immo || []).find(x => /^Valeur nette/.test(x.nom)) || {}).montant || 0;
    }
    const bourse = r.bourse || 0, epargne = (r.epargne || 0) + (r.uc || 0);
    return { an, mo, bourse, epargne, immo, complet: r.epargne !== null && r.epargne !== undefined, total: bourse + epargne + immo };
  }).filter(Boolean);
}
function graduations(mn, mx, n) {
  const brut = (mx - mn) / n || 1, p = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 2.5, 5, 10].map(x => x * p).find(x => x >= brut) || 10 * p;
  const a = Math.floor(mn / pas) * pas, b = Math.ceil(mx / pas) * pas;
  const t = []; for (let v = a; v <= b + pas / 2; v += pas) t.push(+v.toFixed(6));
  return t;
}
function dessinerBarres() {
  const svg = document.getElementById("m-barres"); if (!svg) return;
  const s = seriePatrimoine(); if (s.length < 2) return;
  const series = [["bourse", "Bourse", "--s1"], ["epargne", "Épargne", "--s2"]].concat(s.some(x => x.immo) ? [["immo", "Immobilier net", "--s3"]] : []);
  document.getElementById("m-leg-patri").innerHTML = series.map(x => '<span><i class="carre" style="background:var(' + x[2] + ')"></i>' + x[1] + "</span>").join("");
  const W = Math.max(280, svg.parentElement.clientWidth - 20), H = 210, m = { l: 44, r: 6, t: 8, b: 22 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const ticks = graduations(0, Math.max(...s.map(x => x.total)) * 1.05 || 1, 4), top = ticks[ticks.length - 1];
  const Y = v => m.t + ih - v / top * ih;
  const pas = iw / s.length, bw = Math.max(4, Math.min(24, pas - 4));
  let out = "";
  ticks.forEach(t => {
    out += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '" style="stroke:var(--rule)"/>';
    out += '<text x="' + (m.l - 6) + '" y="' + (Y(t) + 3.5).toFixed(1) + '" text-anchor="end">' + axeEur(t) + "</text>";
  });
  s.forEach((x, i) => {
    const cx = m.l + pas * i + pas / 2; let base = 0;
    series.forEach(([k, , c]) => {
      const v = x[k]; if (!(v > 0)) return;
      const y0 = Y(base), y1 = Y(base + v);
      out += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (y1 + 1).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, y0 - y1 - 1).toFixed(1) + '" rx="2" style="fill:var(' + c + ')"' + (x.complet ? "" : ' fill-opacity=".45"') + "/>";
      base += v;
    });
    if (x.mo === 1 || i === 0) out += '<text x="' + cx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + (x.mo === 1 ? x.an : MOIS[x.mo - 1]) + "</text>";
    out += '<rect class="hitb" data-i="' + i + '" x="' + (cx - pas / 2).toFixed(1) + '" y="0" width="' + pas.toFixed(1) + '" height="' + H + '" fill="transparent"/>';
  });
  svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("height", H);
  svg.innerHTML = out;
  const detail = i => { const x = s[i];
    svg.querySelectorAll(".hitb").forEach(r => r.style.fill = +r.dataset.i === i ? "color-mix(in srgb, var(--ink) 7%, transparent)" : "transparent");
    document.getElementById("m-patri-sel").innerHTML = "<b>" + MOIS[x.mo - 1] + " " + x.an + "</b> : bourse " + eur(x.bourse) + " · épargne " + eur(x.epargne) + (x.immo ? " · immobilier net " + eur(x.immo) : "") + " · total <b>" + eur(x.total) + "</b>" + (x.complet ? "" : " (épargne non suivie ce mois-là)"); };
  svg.querySelectorAll(".hitb").forEach(r => { r.addEventListener("pointerenter", () => detail(+r.dataset.i)); r.addEventListener("pointerdown", () => detail(+r.dataset.i)); });
  detail(s.length - 1);
}
function brancherPatrimoine(v) {
  v.querySelectorAll("[data-cible]").forEach(b => b.addEventListener("click", () => { const c = document.getElementById(b.dataset.cible); if (c) c.scrollIntoView({ block: "start", behavior: reduit ? "auto" : "smooth" }); }));
  dessinerBarres();
}

/* ================= Onglet Stats ================= */
const PERIODES_M = [["1m", "1 mois"], ["3m", "3 mois"], ["6m", "6 mois"], ["ytd", "Depuis janv."], ["1a", "1 an"], ["tout", "Tout"]];
function seriesDisponibles() {
  const noms = (M.enveloppes || []).filter(e => e.type === "env").map(e => e.nom);
  const cols = (M.historique || {}).cols || [];
  const out = [["ip", "Portefeuille"]];
  [["pea", /PEA/], ["cto", /CTO/], ["av", /^AV/], ["cr", /Crypto/i]].forEach(([k, re]) => { const n = noms.find(x => re.test(x)); if (n && cols.includes(k)) out.push([k, n]); });
  return out;
}
function fenetre(rows, per) {
  if (!rows.length || per === "tout") return rows;
  const fin = dateNum(rows[rows.length - 1][0]);
  const debut = per === "ytd" ? new Date(fin.getFullYear() - 1, 11, 31) : new Date(fin.getFullYear(), fin.getMonth() - ({ "1m": 1, "3m": 3, "6m": 6, "1a": 12 }[per] || 6), fin.getDate());
  const cle = debut.getFullYear() * 10000 + (debut.getMonth() + 1) * 100 + debut.getDate();
  let i0 = 0; rows.forEach((r, i) => { if (r[0] <= cle) i0 = i; });
  return rows.slice(i0);
}
function htmlStats() {
  const h = M.historique, envs = M.enveloppes || [];
  const mode = PREF.mode, per = PREF.per, choix = seriesDisponibles();
  const derniere = h && h.rows && h.rows.length ? dateNum(h.rows[h.rows.length - 1][0]) : null;
  const perfLigne = e => '<tr class="' + (e.type === "indice" ? "indice" : "") + '"><td>' + esc(e.nom) + "</td>" +
    ["s1", "m1", "m6", "ytd", "a1", "twr", "mwr"].map(k => '<td class="' + (e.type === "indice" ? "" : sens(e[k])) + '">' + pct(e[k]) + "</td>").join("") + "<td>" + pct(e.vol, 1, false) + "</td></tr>";
  const courbe = h && h.rows && h.rows.length > 1 ?
    '<div class="seg" role="group" aria-label="Type de courbe"><button type="button" data-m-mode="valeur" aria-pressed="' + (mode === "valeur") + '">Valeur et apports</button><button type="button" data-m-mode="base" aria-pressed="' + (mode === "base") + '">Performance vs indices</button></div>' +
    (mode === "base" && choix.length > 1 ? '<div class="chips" role="group" aria-label="Ce que tu compares">' + choix.map(([k, l]) => '<button class="chip" type="button" data-m-serie="' + k + '" aria-pressed="' + (PREF.serie === k) + '">' + esc(l) + "</button>").join("") + "</div>" : "") +
    '<div class="chips" role="group" aria-label="Période">' + PERIODES_M.map(([k, l]) => '<button class="chip" type="button" data-m-per="' + k + '" aria-pressed="' + (per === k) + '">' + l + "</button>").join("") + "</div>" +
    '<div id="m-courbe-box"></div><p class="resume" id="m-resume"></p>' : '<div class="vide">Pas encore assez de relevés pour tracer une courbe.</div>';
  return '<div><h2 class="sec">Courbe <small>' + (derniere ? "relevé du " + dateLongue(derniere) : "") + "</small></h2></div>" + courbe +
    blocRisque() + blocMois() + blocRepartition() +
    blocJours() +
    acc("m-perf", "Performances", "TWR par période, par enveloppe", '<div class="scroll-x"><table class="tab"><thead><tr><th>Enveloppe</th><th>1 sem.</th><th>1 mois</th><th>6 mois</th><th>Janv.</th><th>1 an</th><th>Début</th><th>MWR</th><th>Vol.</th></tr></thead><tbody>' + envs.map(perfLigne).join("") + "</tbody></table></div>", false) +
    blocFrais();
}
function dessinerCourbe() {
  const zone = document.getElementById("m-courbe-box"); if (!zone) return;
  const h = M.historique; if (!h || !h.rows || h.rows.length < 2) return;
  const C = n => h.cols.indexOf(n);
  const rows = fenetre(h.rows, PREF.per), mc = maCouleur();
  let series;
  if (PREF.mode === "valeur") {
    series = [{ nom: "Valeur", k: C("v"), c: mc, w: 2.2, aire: true }, { nom: "Apports cumulés", k: C("a"), c: "var(--idx)", w: 1.6, marche: true, dash: true }];
  } else {
    const ch = seriesDisponibles().find(x => x[0] === PREF.serie) || ["ip", "Portefeuille"];
    series = [{ nom: ch[1], k: C(ch[0]) >= 0 ? C(ch[0]) : C("ip"), c: mc, w: 2.2, base: true },
      { nom: "S&P 500", k: C("isp"), c: "var(--idx)", w: 1.6, base: true, dash: "5 4" },
      { nom: "Nasdaq-100", k: C("inq"), c: "var(--gold)", w: 1.6, base: true, dash: "1.5 3.5" }];
  }
  series = series.filter(s => s.k >= 0);
  series.forEach(s => { const b = rows[0][s.k] || 1; s.v = rows.map(r => ok(r[s.k]) ? (s.base ? r[s.k] / b - 1 : r[s.k]) : null); });
  zone.innerHTML = boiteGraphe("g-moi", series.map(s => ({ nom: s.nom, c: s.c, dash: s.dash === "1.5 3.5" ? "dot" : !!s.dash })));
  const court = PREF.per === "1m";
  const etiqX = (k, kp) => {
    if (kp === null) return "";
    const d = dateNum(k), p = dateNum(kp);
    if (court) return d.getDay() < p.getDay() ? dateCourte(d) : "";
    return d.getMonth() !== p.getMonth() ? (d.getMonth() === 0 ? String(d.getFullYear()) : MOIS[d.getMonth()]) : "";
  };
  const base = PREF.mode === "base";
  tracer(document.getElementById("g-moi"), { x: rows.map(r => r[0]), zeroMin: !base, base, finEtiq: base,
    series: series.map(s => ({ nom: s.nom, v: s.v, c: s.c, w: s.w, aire: s.aire, marche: s.marche, dash: s.dash })),
    fmt: base ? (x => pct(x)) : (x => eur(x)), fmtAxe: base ? (t => pct(t, 0)) : axeEur, titreX: k => dateLongue(dateNum(k)), etiqX });
  const n = rows.length, d0 = dateNum(rows[0][0]), d1 = dateNum(rows[n - 1][0]);
  const r = document.getElementById("m-resume");
  if (!base) {
    const dv = series[0].v[n - 1] - series[0].v[0], da = series[1] ? series[1].v[n - 1] - series[1].v[0] : 0;
    r.innerHTML = "Du " + dateLongue(d0) + " au " + dateLongue(d1) + " : valeur <b>" + eur(dv, 0, true) + "</b>, dont apports <b>" + eur(da, 0, true) + '</b>, soit un gain de <b class="' + sens(dv - da) + '">' + eur(dv - da, 0, true) + "</b>.";
  } else {
    const p = series[0].v[n - 1], sp = series[1] ? series[1].v[n - 1] : null;
    r.innerHTML = "Du " + dateLongue(d0) + " au " + dateLongue(d1) + ' : <b class="' + sens(p) + '">' + pct(p) + "</b>" +
      (ok(sp) ? ", S&amp;P 500 <b>" + pct(sp) + '</b>, écart <b class="' + sens(p - sp) + '">' + pts(p - sp) + "</b>" : "") + ". Indices rebasés au début de la période, apports neutralisés.";
  }
}
function blocRisque() {
  const h = M.historique; if (!h || !h.rows || h.rows.length < 2) return "";
  const k = h.cols.indexOf("ip"); if (k < 0) return "";
  let max = -Infinity, dateMax = null, pire = 0, datePire = null, dateHaut = null;
  h.rows.forEach(r => { if (r[k] > max) { max = r[k]; dateMax = r[0]; } const dd = r[k] / max - 1; if (dd < pire) { pire = dd; datePire = r[0]; dateHaut = dateMax; } });
  const actuel = h.rows[h.rows.length - 1][k] / max - 1;
  const pf = (M.enveloppes || []).find(e => e.type === "total") || {}, sp = (M.synthese || {}).sp500;
  const dc = n => dateCourte(dateNum(n)) + "/" + String(n).slice(2, 4);
  return '<div><h2 class="sec">Risque <small>portefeuille, relevés du soir</small></h2></div><div class="tuiles">' +
    tuile("Baisse actuelle", pct(actuel), sens(actuel), actuel > -0.0005 ? "au plus haut" : "depuis le plus haut du " + dc(dateMax)) +
    tuile("Pire baisse", pct(pire), "down", datePire ? "du " + dc(dateHaut) + " au " + dc(datePire) : "—") +
    tuile("Volatilité 1 an", pct(pf.vol, 1, false), "", "écart type annualisé") +
    tuile("Sharpe 1 an", ok(pf.sharpe) ? F2.format(pf.sharpe) : "—", sens(pf.sharpe), "rendement / risque, &gt; 1 = bon") +
    tuile("Jours en hausse", pct(pf.hausse, 0, false), "", "sur les 12 derniers mois") +
    tuile("Écart avec le S&amp;P 500", ok(pf.twr) && ok(sp) ? pts(pf.twr - sp) : "—", sens(pf.twr - sp), "depuis le début (TWR)") +
    "</div>";
}
function joursRecords() {
  const h = M.historique; if (!h || !h.rows || h.rows.length < 2) return [];
  const ki = h.cols.indexOf("ip"), kv = h.cols.indexOf("v"), ka = h.cols.indexOf("a"), out = [];
  for (let i = 1; i < h.rows.length; i++) {
    const a = h.rows[i - 1], b = h.rows[i];
    if ((dateNum(b[0]) - dateNum(a[0])) / 864e5 > 4.5 || !(a[ki] > 0) || !(b[ki] > 0)) continue;
    out.push({ j: b[0], p: b[ki] / a[ki] - 1, e: (b[kv] - a[kv]) - (b[ka] - a[ka]) });
  }
  return out;
}
function blocJours() {
  const l = joursRecords(); if (l.length < 5) return "";
  const tri = l.slice().sort((x, y) => y.p - x.p), best = tri.slice(0, 5), pire = tri.slice(-5).reverse();
  const date = j => dateLongue(dateNum(j));
  const liste = (titre, xs) => "<div><b>" + titre + "</b>" + xs.map((x, i) => '<div class="l"><span>' + (i + 1) + ". " + date(x.j) + '</span><span class="' + sens(x.p) + '">' + pct(x.p, 2) + '</span><span class="' + sens(x.e) + '">' + eur(x.e, 0, true) + "</span></div>").join("") + "</div>";
  return acc("m-jours", "Meilleurs et pires jours", "sur " + l.length + " jours de bourse",
    '<div class="tuiles">' + tuile("Meilleur jour", pct(best[0].p, 2), "up", date(best[0].j) + " · " + eur(best[0].e, 0, true)) + tuile("Pire jour", pct(pire[0].p, 2), "down", date(pire[0].j) + " · " + eur(pire[0].e, 0, true)) + "</div>" +
    '<div class="m-jr">' + liste("Top 5", best) + liste("Flop 5", pire) + "</div>" +
    '<p class="info">Classés en performance (sans l\'effet de tes versements). Le montant en euros dépend de la taille du portefeuille ce jour-là.</p>', false);
}
function moisParMois() {
  const h = M.historique; if (!h || !h.rows || h.rows.length < 2) return [];
  const kv = h.cols.indexOf("v"), ka = h.cols.indexOf("a"), ki = h.cols.indexOf("ip");
  const fins = [];
  h.rows.forEach((r, i) => { const m = Math.floor(r[0] / 100), s = h.rows[i + 1]; if (!s || Math.floor(s[0] / 100) !== m) fins.push(r); });
  let prec = null;
  return fins.map(r => {
    const twr = prec ? r[ki] / prec[ki] - 1 : r[ki] / h.rows[0][ki] - 1;
    const eurM = prec ? (r[kv] - prec[kv]) - (r[ka] - prec[ka]) : r[kv] - r[ka];
    prec = r;
    return { an: Math.floor(r[0] / 10000), mois: Math.floor(r[0] / 100) % 100, twr, eur: eurM };
  });
}
function blocMois() {
  const m = moisParMois(); if (!m.length) return "";
  const enEur = PREF.moisMode === "eur";
  const ans = Array.from(new Set(m.map(x => x.an))).sort().reverse();
  const maxP = Math.max(.04, ...m.map(x => Math.abs(x.twr))), maxE = Math.max(500, ...m.map(x => Math.abs(x.eur)));
  const lignes = ans.map(an => {
    const ms = m.filter(x => x.an === an);
    const tot = ms.reduce((p, x) => p * (1 + x.twr), 1) - 1, totE = ms.reduce((p, x) => p + x.eur, 0);
    return '<tr><td class="nom">' + an + "</td>" + MOIS.map((nm, i) => {
      const x = ms.find(y => y.mois === i + 1);
      if (!x) return '<td class="vide">·</td>';
      const det = esc("<b>" + MOIS_L[i] + " " + an + "</b> : " + pct(x.twr) + " (TWR) · résultat " + eur(x.eur, 0, true));
      return '<td class="m-c" tabindex="0" style="' + teinte(enEur ? x.eur : x.twr, enEur ? maxE : maxP) + '" data-cel="' + det + '">' + (enEur ? kEur(x.eur) : pct(x.twr)) + "</td>";
    }).join("") + '<td style="' + teinte(enEur ? totE : tot, enEur ? maxE * 3 : maxP * 3) + '"><b>' + (enEur ? kEur(totE) : pct(tot)) + "</b></td></tr>";
  }).join("");
  return '<div><h2 class="sec">Mois par mois <small>' + (enEur ? "résultat en euros" : "TWR, sans l'effet des versements") + "</small></h2></div>" +
    '<div class="seg" role="group" aria-label="Unité"><button type="button" data-m-mois="pct" aria-pressed="' + !enEur + '">Performance (%)</button><button type="button" data-m-mois="eur" aria-pressed="' + enEur + '">Résultat (€)</button></div>' +
    '<div class="scroll-x"><table class="grille"><thead><tr><th></th>' + MOIS.map(x => "<th>" + x + "</th>").join("") + "<th>Année</th></tr></thead><tbody>" + lignes + "</tbody></table></div>" +
    '<p class="resume" id="m-mois-sel">Touche un mois pour le détail.</p>';
}
function blocRepartition() {
  const rep = PREF.rep || "classe";
  const actifs = (M.ref || {}).actifs || [];
  const info = c => actifs.find(a => a.code === c) || {};
  const cle = { classe: l => info(l.code).classe || "Non classé", zone: l => info(l.code).zone || "Non renseignée", ligne: l => l.code, levier: l => { const v = Number(info(l.code).levier) || 1; return v > 1 ? "Levier ×" + v : "Sans levier"; } }[rep] || (l => l.code);
  const groupes = {};
  (M.groupes || []).forEach(g => g.lignes.forEach(l => { if (!l.especes && l.valeur > 0) { const k = cle(l); groupes[k] = (groupes[k] || 0) + l.valeur; } }));
  const tot = Object.values(groupes).reduce((a, b) => a + b, 0) || 1;
  const tri = Object.entries(groupes).sort((a, b) => b[1] - a[1]);
  if (!tri.length) return "";
  const max = tri[0][1];
  return '<div><h2 class="sec">Répartition <small>lignes du portefeuille</small></h2></div>' +
    '<div class="chips" role="group" aria-label="Répartir par">' + [["classe", "Classe"], ["zone", "Zone"], ["ligne", "Ligne"], ["levier", "Levier"]].map(([k, l]) => '<button class="chip" type="button" data-m-rep="' + k + '" aria-pressed="' + (rep === k) + '">' + l + "</button>").join("") + "</div>" +
    '<div class="m-rep">' + tri.map(([k, v]) => '<div><span class="n">' + esc(k) + '</span><span class="b"><i style="width:' + (v / max * 100).toFixed(1) + '%"></i></span><span class="p">' + pct(v / tot, 1, false) + '</span><span class="e">' + eur(v) + "</span></div>").join("") + "</div>";
}
function blocFrais() {
  const f = M.frais || []; if (!f.length) return "";
  const tot = f.find(r => /^Total/.test(r.nom));
  return acc("m-frais", "Frais payés", tot ? eur(tot.total, 0) + " au total" : "courtage, gestion", '<div class="m-liste">' +
    f.map(r => '<div class="r' + (/^Total/.test(r.nom) ? " total" : "") + '"><span class="a">' + esc(r.nom) + '</span><span class="b">' + eur(r.total, 2) + "</span>" +
      '<span class="c">cette année ' + eur(r.annee, 2) + '</span><span class="d">' + pct(r.pct, 2, false) + " des versements</span></div>").join("") + "</div>", false);
}
function brancherStats(v) {
  brancherDefs(v);
  const re = () => { rendre(); };
  v.querySelectorAll("[data-m-mode]").forEach(b => b.addEventListener("click", () => { PREF.mode = b.dataset.mMode; garderPref(); re(); }));
  v.querySelectorAll("[data-m-per]").forEach(b => b.addEventListener("click", () => { PREF.per = b.dataset.mPer; garderPref(); re(); }));
  v.querySelectorAll("[data-m-serie]").forEach(b => b.addEventListener("click", () => { PREF.serie = b.dataset.mSerie; garderPref(); re(); }));
  v.querySelectorAll("[data-m-mois]").forEach(b => b.addEventListener("click", () => { PREF.moisMode = b.dataset.mMois; garderPref(); re(); }));
  v.querySelectorAll("[data-m-rep]").forEach(b => b.addEventListener("click", () => { PREF.rep = b.dataset.mRep; garderPref(); re(); }));
  v.querySelectorAll("td[data-cel]").forEach(td => {
    const f = () => { v.querySelectorAll("td.m-c.sel").forEach(x => x.classList.remove("sel")); td.classList.add("sel"); v.querySelector("#m-mois-sel").innerHTML = td.dataset.cel; };
    td.addEventListener("click", f); td.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); f(); } });
  });
  const g = v.querySelector(".grille"); if (g) { const sx = g.closest(".scroll-x"); if (sx) sx.scrollLeft = sx.scrollWidth; }
  dessinerCourbe();
}

/* ---------- Interface publique ---------- */
window.Moi = {
  rendre,
  rafraichir(frais) { if (configure()) { rendre(); charger(!!frais); } },
  configure,
  connecter(url, k) {
    url = String(url || "").trim();
    if (url) stock.set(K.api, url);
    if (k) stock.set(K.cle, k);
    if (url || k) { M = null; SRC = ""; erreur = ""; dernierAppel = 0; stock.del(K.cache); }
  },
  oublier() { [K.api, K.cle, K.cache].forEach(k => stock.del(k)); M = null; SRC = ""; erreur = ""; ouverts.clear(); },
  async tester(url, k) {
    try {
      const j = await (await fetch(url + (url.includes("?") ? "&" : "?") + "action=ping&cle=" + encodeURIComponent(k), { cache: "no-store" })).json();
      return j.ok ? { ok: true, message: "Ton fichier répond (API version " + (j.version || "?") + ")." } : { ok: false, message: j.message || "Clé refusée." };
    } catch (e) { return { ok: false, message: "Impossible de joindre cette adresse : vérifie qu'elle finit par /exec et que le déploiement est en accès « Tout le monde »." }; }
  },
  etat() { return { configure: configure(), adresse: adresse(), aUneCle: !!cle(), maj: M ? M.majTexte : "" }; }
};
})();
