/* Scénarios de simulation : chaque événement = un mot reconnu, une pause ou un silence. */
(function (root) {
  function build(c) {
    var TAK = [{ k: 'w', w: 'الله' }, { k: 'w', w: 'اكبر' }, { k: 'sil' }];
    function V(s, a, edit) {
      var w = c.words(s, a).slice();
      if (edit) w = edit(w);
      return w.map(function (x) { return { k: 'w', w: x }; }).concat([{ k: 'gap' }]);
    }
    function seq() { return [].concat.apply([], arguments); }
    var fat = []; for (var a = 1; a <= 7; a++) fat = fat.concat(V(1, a));
    return {
      priere: {
        label: 'Prière complète',
        hint: 'Takbīr, Fātiḥa, Al-Ikhlāṣ, puis takbīr du rukūʿ : l’écran s’éteint.',
        ev: seq(TAK, fat, [{ k: 'w', w: 'امين' }, { k: 'gap' }], V(112, 1), V(112, 2), V(112, 3), V(112, 4), TAK)
      },
      change: {
        label: 'Mot changé',
        hint: 'Al-Ikhlāṣ 4 : « واحد » au lieu de « احد ». Liseré rouge, puis correction.',
        ev: seq(V(112, 1), V(112, 2), V(112, 3),
          V(112, 4, function (w) { w[w.length - 1] = 'واحد'; return w; }), [{ k: 'sil' }],
          V(112, 4), V(113, 1))
      },
      oubli: {
        label: 'Mot oublié',
        hint: 'Al-Falaq 2 : « شر » est omis. Le tiret marque le mot manquant.',
        ev: seq(V(113, 1), V(113, 2, function (w) { w.splice(1, 1); return w; }), [{ k: 'sil' }],
          V(113, 2), V(113, 3), V(113, 4), V(113, 5))
      },
      long: {
        label: 'Verset long',
        hint: 'Āyat al-Kursī (2:255) : le texte défile au rythme de la récitation.',
        ev: seq(V(2, 255), V(2, 256))
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = build;
  else root.TPI_SCENARIOS = build;
})(this);
