/*
 * TPI — moteur de suivi de récitation (port JavaScript, embarqué dans l'app)
 * Copie de claude/tpi_engine_v2.js (projet TPI), inchangée.
 */
(function (root) {
  'use strict';
  var MARKS = /[ؐ-ًؚ-ٟۖ-ۭ࣓-ࣿـ]/g;
  var NON_LETTER = /[^ء-ي]/g;
  var EXCEPTIONS = [
    [/^(و|ف|ب|ل|ك)?هاذ/, '$1هذ'],
    [/^(و|ف|ب|ل|ك)?ذالك/, '$1ذلك'],
    [/رحمان/, 'رحمن'],
    [/^(و|ف|ب|ل)?اولاي/, '$1اولي'],
    [/^(و|ف|ب|ل)?الاه(كم|هم|نا|ك|ه|ي|ا)?$/, '$1اله$2'],
    [/^(و|ف)?لاكن/, '$1لكن'],
    [/صلواه/, 'صلاه'], [/زكواه/, 'زكاه'], [/حيواه/, 'حياه']
  ];
  function normWord(w) {
    if (!w) return '';
    w = w.replace(MARKS, '');
    w = w.replace(/ىٰ(?=[ء-يٱ])/g, 'ا').replace(/ىٰ/g, 'ى').replace(/ٰ/g, 'ا');
    w = w.replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(NON_LETTER, '');
    for (var i = 0; i < EXCEPTIONS.length; i++) w = w.replace(EXCEPTIONS[i][0], EXCEPTIONS[i][1]);
    return w;
  }
  function mergeVocative(words) {
    var out = [];
    for (var i = 0; i < words.length; i++) {
      if (words[i] === 'يا' && i + 1 < words.length) { out.push('يا' + words[i + 1]); i++; }
      else out.push(words[i]);
    }
    return out;
  }
  function tokenize(text) {
    return mergeVocative(String(text || '').split(/\s+/).map(normWord).filter(Boolean));
  }
  function displayTokens(display) {
    var raw = display.split(/\s+/).filter(Boolean), disp = [], norm = [];
    for (var i = 0; i < raw.length; i++) {
      var n = normWord(raw[i]);
      if (!n) { if (disp.length) disp[disp.length - 1] += ' ' + raw[i]; continue; }
      if (n === 'يا' && i + 1 < raw.length) { disp.push(raw[i] + ' ' + raw[i + 1]); norm.push('يا' + normWord(raw[i + 1])); i++; continue; }
      disp.push(raw[i]); norm.push(n);
    }
    return { disp: disp, norm: norm };
  }
  function lcs(a, b) {
    var m = b.length, prev = new Array(m + 1).fill(0), cur = new Array(m + 1);
    for (var i = 1; i <= a.length; i++) {
      cur[0] = 0;
      for (var j = 1; j <= m; j++)
        cur[j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      var t = prev; prev = cur; cur = t;
    }
    return prev[m];
  }
  function same(w, e, thr) {
    if (w === e) return true;
    var L = Math.min(w.length, e.length);
    if (L <= 3) return false;
    return similarity(w, e) >= (L <= 5 ? Math.max(88, thr) : thr);
  }
  function similarity(a, b) {
    if (a === b) return 100;
    if (!a || !b) return 0;
    return 200 * lcs(a, b) / (a.length + b.length);
  }
  var PROFILES = {
    IMAM:   { name: 'IMAM',   wordSim: 82, tol: 0.10 },
    FIDELE: { name: 'FIDELE', wordSim: 74, tol: 0.25 }
  };
  var BASMALA_DISPLAY = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';
  function Corpus(data) {
    this.names = data.names; this.ar = data.ar; this.fr = data.fr || null;
    this.norm = []; this.firstIndex = [];
    for (var s = 0; s < this.ar.length; s++) {
      var arr = [];
      for (var a = 0; a < this.ar[s].length; a++) {
        var n = displayTokens(this.ar[s][a]).norm;
        arr.push(n);
        this.firstIndex.push({ s: s + 1, a: a + 1, w0: n[0] });
      }
      this.norm.push(arr);
    }
    this.basmala = displayTokens(BASMALA_DISPLAY).norm;
    this._dispCache = {};
  }
  Corpus.prototype.count = function (s) { return this.ar[s - 1].length; };
  Corpus.prototype.words = function (s, a) { return a === 0 ? this.basmala : this.norm[s - 1][a - 1]; };
  Corpus.prototype.display = function (s, a) { return a === 0 ? BASMALA_DISPLAY : this.ar[s - 1][a - 1]; };
  Corpus.prototype.translation = function (s, a) {
    if (a === 0) return 'Au nom d’Allah, le Tout Miséricordieux, le Très Miséricordieux';
    return this.fr ? this.fr[s - 1][a - 1] : '';
  };
  Corpus.prototype.displayWords = function (s, a) {
    var k = s + ':' + a;
    if (!this._dispCache[k]) this._dispCache[k] = displayTokens(this.display(s, a)).disp;
    return this._dispCache[k];
  };
  Corpus.prototype.successors = function (s, a) {
    if (s === 0) {
      var out = [{ s: 1, a: 2 }];
      for (var t = 2; t <= 114; t++) if (t !== 9) out.push({ s: t, a: 1 });
      return out;
    }
    if (a === 0) return [{ s: s, a: 1 }];
    if (a < this.count(s)) return [{ s: s, a: a + 1 }];
    if (s >= 114) return [];
    if (s + 1 === 9) return [{ s: 9, a: 1 }];
    return [{ s: s + 1, a: 0 }, { s: s + 1, a: 1 }];
  };
  var HARD = 1000;
  function Attempt(E) {
    this.m = E.length; this.row = new Array(this.m + 1);
    for (var j = 0; j <= this.m; j++) this.row[j] = j;
    this.n = 0;
  }
  Attempt.prototype.push = function (simVec) {
    var m = this.m, prev = this.row, cur = new Array(m + 1);
    cur[0] = prev[0] + HARD;
    for (var j = 1; j <= m; j++) {
      var d = prev[j - 1] + (simVec[j - 1] ? 0 : HARD);
      var up = prev[j] + HARD, left = cur[j - 1] + 1;
      cur[j] = d < up ? (d < left ? d : left) : (up < left ? up : left);
    }
    this.row = cur; this.n++;
  };
  Attempt.prototype.minCost = function () { var b = Infinity; for (var j = 0; j <= this.m; j++) if (this.row[j] < b) b = this.row[j]; return b; };
  Attempt.prototype.progress = function () {
    var b = Infinity, bj = 0;
    for (var j = 0; j <= this.m; j++) if (this.row[j] <= b) { b = this.row[j]; bj = j; }
    return bj;
  };
  function budget(profile, m) { return m <= 4 ? 0 : Math.floor(profile.tol * m); }
  function VerseTracker(corpus, profile, s, a) {
    this.s = s; this.a = a; this.E = corpus.words(s, a); this.profile = profile;
    this.budget = budget(profile, this.E.length);
    this.attempts = []; this.errored = false; this.lastProgress = 0;
  }
  VerseTracker.prototype.simVec = function (w) {
    var E = this.E, thr = this.profile.wordSim, v = new Array(E.length);
    for (var j = 0; j < E.length; j++) v[j] = same(w, E[j], thr);
    return v;
  };
  VerseTracker.prototype.push = function (w) {
    var v = this.simVec(w), m = this.E.length;
    if (this.attempts.length === 0 && !this.errored) this.attempts.push(new Attempt(this.E));
    else if (v[0] && this.attempts.length < 4) this.attempts.push(new Attempt(this.E));
    for (var i = 0; i < this.attempts.length; i++) this.attempts[i].push(v);
    for (i = 0; i < this.attempts.length; i++) {
      var at = this.attempts[i];
      if (v[m - 1] && at.row[m] <= this.budget) return { type: 'validated', cost: at.row[m] };
    }
    var self = this;
    this.attempts = this.attempts.filter(function (at) { return at.minCost() <= self.budget; });
    if (this.attempts.length === 0) { this.errored = true; return { type: 'error' }; }
    var p = 0;
    for (i = 0; i < this.attempts.length; i++) p = Math.max(p, this.attempts[i].progress());
    this.lastProgress = p;
    return { type: 'progress', progress: p };
  };
  VerseTracker.prototype.expects = function (w1, w2) {
    var E = this.E, thr = this.profile.wordSim;
    var js = this.attempts.length ? this.attempts.map(function (a) { return a.progress(); }) : [0];
    for (var i = 0; i < js.length; i++) {
      var j = js[i];
      if (j + 1 < E.length && same(w1, E[j], thr) && same(w2, E[j + 1], thr)) return true;
    }
    return false;
  };
  function Locator(corpus, profile, hints) {
    this.c = corpus; this.p = profile; this.cands = []; this.heard = 0; this.hints = hints || null;
  }
  Locator.prototype._spawn = function (w) {
    var c = this.c, thr = this.p.wordSim, out = [];
    for (var i = 0; i < c.firstIndex.length; i++) {
      var f = c.firstIndex[i];
      if (same(w, f.w0, thr)) out.push(this._cand(f.s, f.a, 0, 0));
    }
    if (same(w, c.basmala[0], thr)) out.push(this._cand(0, 0, 0, 0));
    if (this.hints) for (var h = 0; h < this.hints.length; h++) {
      var hs = this.hints[h];
      if (!out.some(function (x) { return x.s === hs.s && x.a === hs.a; })) out.push(this._cand(hs.s, hs.a, 0, 0));
    }
    return out;
  };
  Locator.prototype._cand = function (s, a, cost, done) {
    var E = (s === 0) ? this.c.basmala : this.c.words(s, a);
    return { s: s, a: a, E: E, att: new Attempt(E), cost: cost, done: done, budget: budget(this.p, E.length) };
  };
  Locator.prototype.push = function (w) {
    var thr = this.p.wordSim, fresh = false;
    if (this.cands.length === 0) { this.cands = this._spawn(w); this.heard = 0; fresh = true; }
    this.heard++;
    var allow = Math.floor(this.p.tol * this.heard), next = [], seen = {};
    for (var i = 0; i < this.cands.length; i++) {
      var cd = this.cands[i], E = cd.E, m = E.length, v = new Array(m);
      for (var j = 0; j < m; j++) v[j] = same(w, E[j], thr);
      cd.att.push(v);
      if (v[m - 1] && cd.att.row[m] <= cd.budget) {
        var succ = this.c.successors(cd.s, cd.a);
        for (var k = 0; k < succ.length; k++) {
          var key = succ[k].s + ':' + succ[k].a;
          if (!seen[key]) { seen[key] = 1; next.push(this._cand(succ[k].s, succ[k].a, cd.cost + cd.att.row[m], cd.done + 1)); }
        }
        continue;
      }
      if (cd.cost + cd.att.minCost() <= allow) {
        var key2 = cd.s + ':' + cd.a + ':p';
        if (!seen[key2]) { seen[key2] = 1; next.push(cd); }
      }
    }
    this.cands = next;
    if (this.cands.length === 0 && !fresh) return this.push(w);
    return this.decide();
  };
  Locator.prototype.distinct = function () {
    var set = {};
    this.cands.forEach(function (c) { if (c.s !== 0) set[c.s + ':' + c.a + ':' + c.done] = 1; });
    return Object.keys(set).length;
  };
  Locator.prototype.decide = function () {
    var real = this.cands.filter(function (c) { return c.s !== 0; });
    if (this.hints && this.heard >= 3) {
      for (var i = 0; i < real.length; i++) {
        var c = real[i];
        var isHint = this.hints.some(function (h) { return h.s === c.s && h.a === c.a; });
        if (isHint && c.done === 0 && c.cost + c.att.minCost() === 0 && c.att.progress() >= 3) return { lock: c };
      }
    }
    if (this.cands.length === 1 && real.length === 1 && (this.heard >= 3 || real[0].done >= 1)) return { lock: real[0] };
    return { lock: null, n: this.distinct() };
  };
  function Engine(corpus, profileName) { this.c = corpus; this.setProfile(profileName || 'IMAM'); this.reset(); }
  Engine.prototype.setProfile = function (name) { this.profile = PROFILES[name] || PROFILES.IMAM; };
  Engine.prototype.reset = function () {
    this.state = 'idle'; this.trackers = []; this.locator = null; this.pendingAllah = false;
    this.savedNext = null; this.lastValidated = null; this.flash = null;
    this.message = 'En attente de la récitation'; this.errorInfo = '';
    this.stats = { validated: 0, errors: 0, words: 0 };
  };
  Engine.prototype._setTargets = function (refs) {
    var self = this;
    this.trackers = refs.map(function (r) { return new VerseTracker(self.c, self.profile, r.s, r.a); });
    if (refs.length === 0) { this.state = 'end'; this.message = 'Fin du Coran'; }
  };
  Engine.prototype.startAt = function (s, a) {
    this.reset(); this._setTargets([{ s: s, a: a }]); this.state = 'tracking';
    this.message = 'Position fixée manuellement'; return this.result();
  };
  Engine.prototype._startLocating = function (hints) { this.locator = new Locator(this.c, this.profile, hints); this.state = 'locating'; };
  Engine.prototype._lock = function (cand) {
    var t = new VerseTracker(this.c, this.profile, cand.s, cand.a);
    t.attempts = [cand.att]; t.lastProgress = cand.att.progress();
    this.trackers = [t]; this.locator = null; this.state = 'tracking'; this.message = 'Position identifiée';
    if (!(cand.s === 1)) this.savedNext = null;
  };
  Engine.prototype.push = function (text) {
    var words = tokenize(text);
    for (var i = 0; i < words.length; i++) this._word(words[i]);
    return this.result();
  };
  Engine.prototype.flush = function () {
    if (this.pendingAllah) { this.pendingAllah = false; this._feed('الله'); }
    return this.result();
  };
  Engine.prototype._word = function (w) {
    this.stats.words++;
    if (this.pendingAllah) {
      this.pendingAllah = false;
      if (similarity(w, 'اكبر') >= 82 && !this._expects('الله', 'اكبر')) { this._takbir(); return; }
      this._feed('الله');
    }
    if (w === 'الله') { this.pendingAllah = true; return; }
    if (this.lastValidated && this.lastValidated.s === 1 && this.lastValidated.a === 7 && similarity(w, 'امين') >= 80 && this._progress() === 0) return;
    this._feed(w);
  };
  Engine.prototype._expects = function (w1, w2) {
    if (this.state === 'tracking' || this.state === 'error')
      return this.trackers.some(function (t) { return t.expects(w1, w2); });
    if (this.state === 'locating' && this.locator)
      return this.locator.cands.some(function (c) {
        var j = c.att.progress();
        return j + 1 < c.E.length && c.E[j] === w1 && similarity(c.E[j + 1], w2) >= 82;
      });
    return false;
  };
  Engine.prototype._progress = function () { var p = 0; this.trackers.forEach(function (t) { p = Math.max(p, t.lastProgress); }); return p; };
  Engine.prototype._takbir = function () {
    this.flash = null;
    if (this.state === 'tracking' || this.state === 'error') {
      this.savedNext = this.trackers.map(function (t) { return { s: t.s, a: t.a }; });
      this.state = 'transition'; this.message = 'Allāhu akbar — changement de position'; this.trackers = [];
      return;
    }
    if (this.state === 'idle' || this.state === 'end') { this.state = 'transition'; this.message = 'Allāhu akbar — début de prière'; return; }
    this.message = 'Allāhu akbar';
    if (this.state === 'locating') this._startLocating(this._hints());
  };
  Engine.prototype._hints = function () {
    if (!this.savedNext) return null;
    return this.savedNext.concat([{ s: 1, a: 1 }, { s: 1, a: 2 }]);
  };
  Engine.prototype._feed = function (w) {
    if (this.state === 'end') return;
    if (this.state === 'idle' || this.state === 'transition') this._startLocating(this._hints());
    this.flash = null;
    if (this.state === 'locating') {
      var d = this.locator.push(w);
      if (d.lock) this._lock(d.lock);
      else { this.message = d.n > 1 ? 'Plusieurs passages possibles — écoute en cours' : 'Identification du passage…'; this._ambiguity = d.n; return; }
      var t0 = this.trackers[0];
      if (t0.attempts[0] && t0.attempts[0].row[t0.E.length] <= t0.budget && t0.attempts[0].progress() === t0.E.length) this._validated(t0, 0);
      return;
    }
    var results = this.trackers.map(function (t) { return t.push(w); });
    for (var i = 0; i < results.length; i++) if (results[i].type === 'validated') { this._validated(this.trackers[i], results[i].cost); return; }
    var alive = results.some(function (r) { return r.type === 'progress'; });
    var anyErrored = this.trackers.some(function (t) { return t.errored; });
    if (!alive || (anyErrored && this.trackers.length === 1)) {
      if (this.state !== 'error') { this.stats.errors++; this.errorInfo = this._diagnose(w); }
      this.state = 'error'; this.message = this.errorInfo;
    } else if (this.state !== 'error') { this.message = ''; }
  };
  Engine.prototype._diagnose = function () {
    var t = this.trackers[this.trackers.length - 1];
    if (!t) return 'Erreur de récitation';
    var nx = this.c.successors(t.s, t.a);
    if (t.lastProgress === 0 && nx.length) return 'Verset ' + t.a + ' non récité — reprenez ce verset';
    return 'Erreur détectée — récitez à nouveau ce verset';
  };
  Engine.prototype._validated = function (t, cost) {
    var wasError = this.state === 'error';
    this.stats.validated++;
    this.lastValidated = { s: t.s, a: t.a };
    this.flash = { s: t.s, a: t.a, corrected: wasError, cost: cost };
    this.message = wasError ? 'Erreur corrigée' : ''; this.errorInfo = '';
    if (t.s === 1 && t.a === 7) {
      this.trackers = [];
      this._startLocating(this.savedNext ? this._hints().filter(function (h) { return h.s !== 1; }) : [{ s: 2, a: 1 }]);
      this.state = 'locating'; this.message = 'Fātiḥa terminée — en attente de la suite';
      return;
    }
    this.state = 'tracking';
    this._setTargets(this.c.successors(t.s, t.a));
  };
  Engine.prototype.result = function () {
    var r = { state: this.state, message: this.message, profile: this.profile.name, surah: 0, ayah: 0,
      status: 'waiting', color: 'white', text: '', words: [], progress: 0, total: 0, translation: '',
      next_ayah: 0, confidence: 0, candidates: 0, flash: this.flash, stats: this.stats };
    if (this.state === 'locating') { r.status = this.locator && this.locator.cands.length ? 'ambiguous' : 'waiting'; r.candidates = this._ambiguity || 0; return r; }
    if (this.state === 'transition' || this.state === 'idle' || this.state === 'end') return r;
    var t = this.trackers[this.trackers.length - 1];
    var b = this.trackers[0];
    if (this.trackers.length > 1 && b.a === 0 && !b.errored && b.lastProgress > 0) t = b;
    r.surah = t.s; r.ayah = t.a; r.text = this.c.display(t.s, t.a); r.words = this.c.displayWords(t.s, t.a);
    r.total = t.E.length; r.progress = t.lastProgress; r.translation = this.c.translation(t.s, t.a);
    var nx = this.c.successors(t.s, t.a); r.next_ayah = nx.length ? nx[nx.length - 1].a : 0;
    r.confidence = r.total ? r.progress / r.total : 0;
    if (this.state === 'error') { r.status = 'error'; r.color = 'red'; }
    else if (this.flash) { r.status = 'validated'; r.color = 'green'; }
    else { r.status = r.progress > 0 ? 'ok' : 'waiting'; }
    return r;
  };
  var api = { Engine: Engine, Corpus: Corpus, tokenize: tokenize, normWord: normWord, similarity: similarity, same: same, PROFILES: PROFILES, displayTokens: displayTokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TPI = api;
})(this);
