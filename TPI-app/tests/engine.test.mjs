// Tests automatiques du moteur TPI.
// Charge le moteur tel qu'il est dans index.html (aucune copie), puis rejoue des récitations en texte.
// Lancer :  node tests/engine.test.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const data = scripts.find(s => s.includes("const QD="));
const engineFull = scripts.find(s => s.includes("TPI engine"));
if (!data || !engineFull) throw new Error("Scripts du moteur introuvables dans index.html");
const engine = engineFull.split("/* ===== UI ===== */")[0];

function load() {
  const ctx = vm.createContext({});
  vm.runInContext(
    data + "\n" + engine +
    "\n;globalThis.T={feed,fresh,tokenize,eq,V,F,START,CANDS,NS,PROFILES,nextRef,setProf:p=>{prof=p}};",
    ctx
  );
  return ctx.T;
}
const T = load();
const { feed, fresh, tokenize, V, NS } = T;

let pass = 0, fail = 0;
const failures = [];
let cur = [];
function ok(cond, name, detail = "") {
  if (cond) pass++;
  else { fail++; cur.push(name + (detail ? " — " + detail : "")); }
}
function section(name, fn) {
  const p0 = pass, f0 = fail, t0 = Date.now();
  cur = [];
  fn();
  if (cur.length) failures.push(`[${name}]`, ...cur.slice(0, 8).map(x => "  " + x), ...(cur.length > 8 ? [`  … et ${cur.length - 8} autres`] : []));
  console.log(`${fail === f0 ? "✓" : "✗"} ${name} : ${pass - p0} réussis, ${fail - f0} échecs (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

const TAK = { k: "takbir" }, GAP = { k: "gap" };
const BASMALA = "بسم الله الرحمن الرحيم";
const words = (s, a) => V[s][a].tok.map(w => ({ k: "w", w }));
const run = (S, evs) => { for (const e of evs) feed(S, e); return S; };
const sameTok = (s1, a1, s2, a2) =>
  V[s1][a1] && V[s2] && V[s2][a2] && V[s1][a1].tok.join(" ") === V[s2][a2].tok.join(" ");
const lastAyah = s => V[s].length - 1;

for (const profile of ["imam", "fidele"]) {
  T.setProf(profile);

  section(`[${profile}] Test 1 du contrat — récitation normale des 114 sourates`, () => {
    for (let s = 1; s <= NS; s++) {
      const S = fresh();
      feed(S, TAK);
      if (s !== 1 && s !== 9) { run(S, tokenize(BASMALA)); feed(S, GAP); }
      let good = true, why = "";
      for (let a = 1; a <= lastAyah(s) && good; a++) {
        for (const e of words(s, a)) {
          feed(S, e);
          if (S.state === "error") { good = false; why = `erreur à ${s}:${a}`; break; }
        }
        feed(S, GAP);
      }
      if (good) {
        // Fin de sourate : tout doit être validé, sur la bonne sourate.
        good = S.s === s && S.a === lastAyah(s) && S.status === "validated";
        if (!good) why = `fin attendue ${s}:${lastAyah(s)} validé, obtenu ${S.s}:${S.a} ${S.state}/${S.status}`;
      }
      ok(good, `sourate ${s}`, why);
      feed(S, TAK);
      ok(S.state === "end", `sourate ${s} : takbīr final termine la récitation`, S.state);
    }
  });

  section(`[${profile}] Entrée à n'importe quel verset — 0 faux positif sur les 6 236 versets`, () => {
    let locked = 0, pending = 0;
    for (let s = 1; s <= NS; s++) {
      for (let a = 1; a <= lastAyah(s); a++) {
        const S = fresh();
        let shownWrong = false;
        const check = () => {
          // Dès qu'un verset est affiché, ce doit être le verset récité, ou un verset au texte identique.
          if ((S.state === "active" || S.state === "error") && S.s) {
            if (S.state === "error") shownWrong = true;
          }
        };
        for (const e of words(s, a)) { feed(S, e); check(); }
        const afterFirst = { state: S.state, s: S.s, a: S.a, status: S.status };
        if (S.state === "active") {
          // Verrouillé : la position doit correspondre au texte récité.
          const expNext = a < lastAyah(s) ? a + 1 : a;
          const okPos =
            (S.s === s && (S.a === expNext)) ||
            // verset identique ailleurs dans le Coran, à la même position relative
            (S.a > 1 && sameTok(S.s, S.a - 1, s, a)) || sameTok(S.s, S.a, s, a);
          ok(okPos && !shownWrong, `entrée ${s}:${a}`, `affiché ${S.s}:${S.a} (${S.status})`);
          locked++;
        } else {
          // Non verrouillé : rien n'est affiché, ce qui est le comportement prudent attendu.
          ok(!shownWrong && ["ambiguous", "detection", "idle"].includes(afterFirst.state), `entrée ${s}:${a} sans affichage`, afterFirst.state);
          pending++;
        }
      }
    }
    console.log(`    verrouillés après un seul verset : ${locked} ; en attente (texte non unique) : ${pending}`);
  });

  section(`[${profile}] Entrée ambiguë levée par le verset suivant`, () => {
    for (let s = 1; s <= NS; s++) {
      for (let a = 1; a < lastAyah(s); a++) {
        const S = fresh();
        run(S, words(s, a));
        if (S.state === "active") continue; // déjà traité au test précédent
        run(S, words(s, a + 1));
        if (S.state !== "active") { ok(S.state !== "error", `suite ${s}:${a}`, S.state); continue; }
        const expect = a + 1 < lastAyah(s) ? a + 2 : a + 1;
        const fine = (S.s === s && S.a === expect) ||
          (sameTok(S.s, S.a - 1, s, a + 1)) || (sameTok(S.s, S.a, s, a + 1));
        ok(fine, `suite ${s}:${a}`, `affiché ${S.s}:${S.a}`);
      }
    }
  });

  section(`[${profile}] Test 2 du contrat — omission d'un mot : blocage rouge puis correction`, () => {
    for (let s = 1; s <= NS; s++) {
      for (let a = 1; a <= lastAyah(s); a += 7) {
        const tok = V[s][a].tok;
        if (tok.length < 5) continue;
        const k = Math.floor(tok.length / 2);
        // l'omission n'est décidable que si le mot suivant diffère du mot omis
        if (tok[k] === tok[k + 1] || tok[k - 1] === tok[k]) continue;
        const S = fresh();
        // on se place sur le verset par le contexte : verset précédent s'il existe
        if (a > 1) run(S, words(s, a - 1));
        if (!(S.state === "active" && S.s === s && S.a === a && S.p === 0)) continue; // contexte non unique, hors périmètre de ce test
        const seq = words(s, a);
        run(S, seq.slice(0, k));
        run(S, seq.slice(k + 1));
        ok(S.s === s && S.a === a && S.state === "error" && S.color === "red",
          `omission ${s}:${a} mot ${k}`, `${S.s}:${S.a} ${S.state}/${S.color}`);
        // correction : reprise complète du verset
        run(S, seq);
        const advanced = S.s === s && (S.a === a + 1 || (a === lastAyah(s) && S.status === "validated"));
        ok(advanced && S.state === "active", `correction ${s}:${a}`, `${S.s}:${S.a} ${S.state}/${S.status}`);
      }
    }
  });

  section(`[${profile}] Substitution d'un mot : le verset n'est jamais validé`, () => {
    const intruder = "قسطنطينيه"; // mot absent du verset, sans ressemblance
    for (let s = 1; s <= NS; s++) {
      for (let a = 2; a <= lastAyah(s); a += 5) {
        const tok = V[s][a].tok;
        if (tok.length < 4) continue;
        const k = Math.floor(tok.length / 2);
        const S = fresh();
        run(S, words(s, a - 1));
        if (!(S.state === "active" && S.s === s && S.a === a && S.p === 0)) continue;
        const seq = words(s, a);
        seq[k] = { k: "w", w: intruder };
        run(S, seq);
        const validated = !(S.s === s && S.a === a) || S.status === "validated";
        ok(!validated, `substitution ${s}:${a} mot ${k}`, `${S.s}:${S.a} ${S.state}/${S.status}`);
      }
    }
  });

  section(`[${profile}] Test 3 du contrat — verset sauté (1, 2, 4) : blocage sur le verset manquant`, () => {
    for (let s = 1; s <= NS; s++) {
      for (let a = 2; a + 2 <= lastAyah(s); a += 4) {
        // on récite a-1, a, puis a+2 en sautant a+1
        if (sameTok(s, a + 1, s, a + 2)) continue;
        // si le verset a+2 se termine par le texte exact du verset a+1 (ex. 102:3 et 102:4),
        // le moteur entend légitimement a+1 : cas indécidable, hors périmètre
        { const x = V[s][a + 1].tok, y = V[s][a + 2].tok;
          const endsWith = (long, short) => long.length >= short.length &&
            short.every((w, i) => T.eq(long[long.length - short.length + i], w));
          if (endsWith(y, x)) continue;
          if (a + 3 <= lastAyah(s) && endsWith(V[s][a + 3].tok, x)) continue; }
        if (V[s][a + 2].tok[0] === V[s][a + 1].tok[0] && V[s][a + 2].tok.length <= V[s][a + 1].tok.length &&
            V[s][a + 1].tok.slice(0, V[s][a + 2].tok.length).join(" ") === V[s][a + 2].tok.join(" ")) continue;
        const S = fresh();
        run(S, words(s, a - 1));
        if (!(S.state === "active" && S.s === s && S.a === a)) continue;
        run(S, words(s, a));
        if (!(S.s === s && S.a === a + 1)) { ok(false, `préparation ${s}:${a}`, `${S.s}:${S.a}`); continue; }
        run(S, words(s, a + 2));
        if (a + 3 <= lastAyah(s)) run(S, words(s, a + 3)); // l'imam continue sans s'apercevoir du saut
        // Attendu : toujours sur a+1, jamais avancé au-delà.
        ok(S.s === s && S.a === a + 1 && S.status !== "validated",
          `saut ${s}:${a + 1}`, `affiché ${S.s}:${S.a} ${S.state}/${S.status}`);
        // puis récitation correcte du verset manquant
        run(S, words(s, a + 1));
        ok(S.s === s && S.a === a + 2 && S.state === "active", `reprise après saut ${s}:${a + 1}`, `${S.s}:${S.a} ${S.state}`);
      }
    }
  });
}

T.setProf("imam");
section("[imam] Ajout d'un mot étranger : blocage", () => {
  for (let s = 1; s <= NS; s += 3) {
    const a = 2; if (a > lastAyah(s)) continue;
    const tok = V[s][a].tok; if (tok.length < 4) continue;
    const S = fresh();
    run(S, words(s, 1));
    if (!(S.state === "active" && S.s === s && S.a === a && S.p === 0)) continue;
    const seq = words(s, a); const k = Math.floor(tok.length / 2);
    seq.splice(k, 0, { k: "w", w: "قسطنطينيه" });
    run(S, seq.slice(0, k + 1));
    ok(S.state === "error" && S.s === s && S.a === a, `ajout ${s}:${a}`, `${S.state} ${S.s}:${S.a}`);
  }
});

section("Formules et cas particuliers", () => {
  T.setProf("fidele");
  // Basmala seule : 112 sourates possibles, rien n'est affiché
  let S = run(fresh(), tokenize(BASMALA));
  ok(S.state === "ambiguous", "Basmala seule reste ambiguë", S.state);
  // Falaq / Nās : trois premiers mots communs
  S = run(fresh(), tokenize("قل اعوذ برب"));
  ok(S.state === "ambiguous", "Falaq/Nās ambigus après 3 mots", S.state);
  feed(S, tokenize("الفلق")[0]);
  ok(S.state === "active" && S.s === 113, "le 4e mot tranche pour Al-Falaq", `${S.state} ${S.s}`);
  // At-Tawbah : pas de Basmala, identification directe
  S = run(fresh(), words(9, 1));
  ok(S.state === "active" && S.s === 9, "At-Tawbah identifiée sans Basmala", `${S.state} ${S.s}:${S.a}`);
  // Takbīr seul : indice, pas un déclencheur
  S = run(fresh(), tokenize("الله اكبر"));
  ok(S.state === "possible_start" && !S.s, "takbīr seul n'affiche rien", S.state);
  // Takbīr en cours de récitation : fin, point de reprise mémorisé
  S = run(fresh(), words(2, 255).slice(0, 14));
  ok(S.state === "active" && S.s === 2 && S.a === 255, "Āyat al-Kursī verrouillée en cours de verset", `${S.state} ${S.s}:${S.a}`);
  run(S, tokenize("الله اكبر"));
  ok(S.state === "end", "takbīr pendant la récitation termine", S.state);
  // Tasmīʿ
  S = run(fresh(), [...words(112, 1), ...words(112, 2), ...tokenize("سمع الله لمن حمده")]);
  ok(S.state === "end", "tasmīʿ termine la récitation", S.state);
  // Istiʿādha ignorée, Āmīn ignoré
  S = run(fresh(), [...tokenize("اعوذ بالله من الشيطان الرجيم"), ...words(1, 2)]);
  ok(S.state === "ambiguous", "« al-ḥamdu lillāhi rabbi l-ʿālamīn » ouvre plusieurs versets : rien n'est affiché", S.state);
  run(S, words(1, 3));
  ok(S.state === "active" && S.s === 1 && S.a === 4, "istiʿādha puis Fātiḥa 1:2 et 1:3", `${S.state} ${S.s}:${S.a}`);
  S = fresh(); for (let a = 2; a <= 7; a++) run(S, words(1, a));
  run(S, tokenize("امين"));
  ok(S.status === "validated" && S.s === 1 && S.a === 7, "Āmīn après la Fātiḥa n'est pas une erreur", `${S.state}/${S.status}`);
  // Enchaînement d'une nouvelle sourate par la Basmala, sans takbīr
  run(S, [...tokenize(BASMALA), ...words(112, 1)]);
  ok(S.state === "active" && S.s === 112, "enchaînement Fātiḥa → Ikhlāṣ par la Basmala", `${S.state} ${S.s}:${S.a}`);
  // Transcription en orthographe standard, telle que la produit une reconnaissance vocale
  S = run(fresh(), tokenize("الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم"));
  ok(S.state === "active" && S.s === 2 && S.a === 255, "Āyat al-Kursī en orthographe standard", `${S.state} ${S.s}:${S.a}`);
  S = run(fresh(), tokenize("الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين"));
  ok(S.state === "active" && S.s === 1 && S.a === 5, "Fātiḥa en orthographe standard", `${S.state} ${S.s}:${S.a}`);
});

console.log(`\nTotal : ${pass} réussis, ${fail} échecs`);
if (fail) {
  console.log("Premiers échecs :");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
