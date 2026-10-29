/* ============================================================
   VERSUS · moteur de calcul
   Les rendements mensuels viennent du Sheet (colonnes « Rendement » des onglets Data).
   Ce moteur ne fait que les enchaîner sur la période choisie, avec les mêmes
   définitions que le Tableau de bord :
   - TWR = produit des (1 + rendement mensuel) − 1
   - Volatilité = écart-type (échantillon) des rendements mensuels × √12
   - Sharpe = (moyenne mensuelle × 12 − taux sans risque) / volatilité
   - Pire baisse = plus fort recul de l'indice (base 100) depuis un plus haut
   - MWR = TRI des flux (valeur de départ, versements, valeur finale),
     non annualisé sous un an
   ============================================================ */
const ENVELOPPES = ["Portefeuille", "PEA", "Assurance vie", "CTO", "Crypto"];

function cleMoins(k, n) { let y = Math.floor(k / 100), m = k % 100 - n; while (m <= 0) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y * 100 + m; }
function cleVersDate(k) { const y = Math.floor(k / 100), m = k % 100; return new Date(y, m, 0); }
function cleDeIso(iso) { return iso ? +iso.slice(0, 4) * 100 + +iso.slice(5, 7) : 0; }

/** Série d'une personne pour une enveloppe : [{k, d, verse, val, gain, r, cum, brut}] */
function serie(p, e) {
  return p.rows.map(r => {
    const c = r[3], o = e * 5;
    let val = c[o + 1];
    if (e === 0 && !(val > 0)) val = null;          // portefeuille vide = pas de relevé
    return { k: r[0], d: r[1], verse: c[o] || 0, val: val, gain: c[o + 2], r: c[o + 3], cum: c[o + 4] || 0, brut: r[2] };
  });
}

/** Dernier mois où au moins une personne a une valeur pour cette enveloppe */
function finGlobale(D, e) {
  let f = 0;
  D.personnes.forEach(p => serie(p, e).forEach(s => { if (s.val !== null && s.val !== undefined && s.k > f) f = s.k; }));
  return f;
}

/** Début de période (exclu) : les mois retenus sont ceux strictement après cette clé */
function debutPeriode(D, per, fin) {
  switch (per) {
    case "mois": return cleMoins(fin, 1);
    case "3m": return cleMoins(fin, 3);
    case "6m": return cleMoins(fin, 6);
    case "ytd": return (Math.floor(fin / 100) - 1) * 100 + 12;
    case "12m": return cleMoins(fin, 12);
    case "comp": return cleDeIso(D.marche.dateComparaison);
    default: return 0;
  }
}

function rendementsIndice(D, i) {
  const m = {};
  if (i === null || i === undefined || i < 0) return m;
  D.marche.mois.forEach(l => { if (typeof l[i + 1] === "number") m[l[0]] = l[i + 1]; });
  return m;
}

function ecartType(xs) {
  if (xs.length < 2) return null;
  const moy = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - moy) * (b - moy), 0) / (xs.length - 1));
}

/** TRI (XIRR) par dichotomie : flux [{t: Date, v: montant}] */
function xirr(flux) {
  if (flux.length < 2) return null;
  const t0 = flux[0].t.getTime();
  const f = r => flux.reduce((a, x) => a + x.v / Math.pow(1 + r, (x.t.getTime() - t0) / 864e5 / 365), 0);
  let lo = -0.9999, hi = 10, flo = f(lo), fhi = f(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/**
 * Statistiques d'une personne sur une enveloppe et une période ]deb, fin].
 * idx1 / idx2 : numéros d'indice (0-7) ou null.
 */
function stats(D, p, e, deb, fin, idx1, idx2) {
  const s = serie(p, e);
  const mois = s.filter(x => x.k > deb && x.k <= fin && typeof x.r === "number");
  const derniere = s.filter(x => x.k <= fin && x.val !== null && x.val !== undefined).pop() || null;
  const res = {
    nom: p.nom, n: mois.length, mois: mois,
    valeur: derniere ? derniere.val : null, verse: derniere ? derniere.cum : null,
    dernierMois: derniere ? derniere.k : null
  };
  res.pvLatente = derniere ? derniere.val - derniere.cum : null;
  res.pvLatentePct = derniere && derniere.cum ? res.pvLatente / derniere.cum : null;
  if (!mois.length) return res;

  const rs = mois.map(x => x.r);
  let idx = 100, haut = 100, pire = 0;
  res.chemin = [{ k: null, v: 100 }];
  rs.forEach((r, i) => {
    idx *= 1 + r; haut = Math.max(haut, idx);
    pire = Math.min(pire, idx / haut - 1);
    res.chemin.push({ k: mois[i].k, v: idx });
  });
  res.twr = idx / 100 - 1;
  res.baisseMax = pire;
  res.baisseActuelle = idx / haut - 1;
  const et = ecartType(rs);
  res.vol = et === null ? null : et * Math.sqrt(12);
  const moy = rs.reduce((a, b) => a + b, 0) / rs.length;
  res.sharpe = res.vol ? (moy * 12 - (D.marche.tauxSansRisque || 0)) / res.vol : null;
  let ib = 0, iw = 0;
  rs.forEach((r, i) => { if (r > rs[ib]) ib = i; if (r < rs[iw]) iw = i; });
  res.meilleur = { r: rs[ib], k: mois[ib].k };
  res.pire = { r: rs[iw], k: mois[iw].k };
  res.positifs = rs.filter(r => r > 0).length / rs.length;
  res.pvPeriode = mois.reduce((a, x) => a + (x.gain || 0), 0);
  res.versePeriode = mois.reduce((a, x) => a + (x.verse || 0), 0);
  res.debutK = mois[0].k;

  [[idx1, "i1"], [idx2, "i2"]].forEach(([n, cle]) => {
    if (n === null || n === undefined || n < 0) return;
    const m = rendementsIndice(D, n);
    let v = 1, bat = 0;
    mois.forEach((x, i) => { const ri = m[x.k] || 0; v *= 1 + ri; if (rs[i] > ri) bat++; });
    res[cle] = { twr: v - 1, battus: bat / mois.length };
  });

  // MWR : départ = ligne précédant le premier mois retenu (valeur à cette date, 0 si vide)
  const i0 = s.indexOf(mois[0]);
  const base = i0 > 0 ? s[i0 - 1] : null;
  const dern = mois[mois.length - 1];
  const flux = [{ t: new Date((base ? base.d : mois[0].d) + "T12:00:00"), v: -(base && base.val ? base.val : 0) }];
  mois.forEach(x => { if (x.verse) flux.push({ t: new Date(x.d + "T12:00:00"), v: -x.verse }); });
  flux.push({ t: new Date(dern.d + "T12:00:00"), v: dern.val || 0 });
  const jours = (flux[flux.length - 1].t - flux[0].t) / 864e5;
  const tri = xirr(flux);
  res.mwr = tri === null ? null : (jours < 365 ? Math.pow(1 + tri, jours / 365) - 1 : tri);
  return res;
}

/** Statistiques d'un indice seul sur ]deb, fin] */
function statsIndice(D, n, deb, fin) {
  const m = rendementsIndice(D, n);
  const ks = Object.keys(m).map(Number).filter(k => k > deb && k <= fin).sort((a, b) => a - b);
  if (!ks.length) return null;
  const rs = ks.map(k => m[k]);
  let idx = 100, haut = 100, pire = 0;
  const chemin = [{ k: null, v: 100 }];
  rs.forEach((r, i) => { idx *= 1 + r; haut = Math.max(haut, idx); pire = Math.min(pire, idx / haut - 1); chemin.push({ k: ks[i], v: idx }); });
  const et = ecartType(rs);
  const vol = et === null ? null : et * Math.sqrt(12);
  const moy = rs.reduce((a, b) => a + b, 0) / rs.length;
  let ib = 0, iw = 0;
  rs.forEach((r, i) => { if (r > rs[ib]) ib = i; if (r < rs[iw]) iw = i; });
  return {
    nom: D.marche.indices[n], indice: n, n: ks.length, twr: idx / 100 - 1, vol: vol,
    sharpe: vol ? (moy * 12 - (D.marche.tauxSansRisque || 0)) / vol : null,
    baisseMax: pire, meilleur: { r: rs[ib], k: ks[ib] }, pire: { r: rs[iw], k: ks[iw] },
    positifs: rs.filter(r => r > 0).length / rs.length, chemin: chemin, debutK: ks[0]
  };
}

/** Palmarès par année civile (portefeuille total ou enveloppe choisie) */
function palmares(D, e, idx1, idx2) {
  const fin = finGlobale(D, e);
  if (!fin) return [];
  const annees = new Set();
  D.personnes.forEach(p => serie(p, e).forEach(x => { if (typeof x.r === "number" && x.k <= fin) annees.add(Math.floor(x.k / 100)); }));
  return [...annees].sort().map(y => {
    const deb = (y - 1) * 100 + 12, f = Math.min(y * 100 + 12, fin);
    const ligne = { annee: y, personnes: {}, mois: 0 };
    const ks = new Set();
    D.personnes.forEach(p => {
      const st = stats(D, p, e, deb, f, null, null);
      if (st.n) { ligne.personnes[p.nom] = st.twr; st.mois.forEach(x => ks.add(x.k)); }
    });
    ligne.mois = ks.size;
    ligne.partiel = f < y * 100 + 12 || [...ks].some(() => false);
    ligne.debutPartiel = Math.min(...ks) > y * 100 + 1;
    ligne.enCours = f < y * 100 + 12;
    [idx1, idx2].forEach((n, j) => { if (n !== null && n >= 0) { const si = statsIndice(D, n, deb, f); ligne["i" + (j + 1)] = si ? si.twr : null; } });
    let best = null;
    Object.entries(ligne.personnes).forEach(([nom, v]) => { if (best === null || v > ligne.personnes[best]) best = nom; });
    ligne.vainqueur = best;
    return ligne;
  });
}

/** Projection d'objectif : valeur actuelle capitalisée au taux mensuel, versement en fin de mois */
function projection(valeur, versement, rendement, depuisK, jusquaIso) {
  const fin = cleDeIso(jusquaIso);
  const tm = Math.pow(1 + (rendement || 0), 1 / 12) - 1;
  const pts = [{ k: depuisK, v: valeur }];
  let v = valeur, k = depuisK, garde = 0;
  while (k < fin && garde++ < 600) {
    k = cleMoins(k, -1);
    v = v * (1 + tm) + (versement || 0);
    pts.push({ k: k, v: v });
  }
  return pts;
}

if (typeof module !== "undefined") module.exports = { ENVELOPPES, serie, finGlobale, debutPeriode, stats, statsIndice, palmares, projection, cleMoins, cleVersDate, xirr };
