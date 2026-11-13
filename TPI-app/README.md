# TPI — Tapis de Prière Intelligent

Application web du TPI : elle reconnaît la récitation du Coran, affiche le verset, le valide et n'avance que sur récitation correcte.

## Utilisation

Ouvrir la page dans Chrome (ordinateur ou Android), avec une connexion internet : la reconnaissance vocale est celle de Chrome.

- **Démarrer l'écoute** : la page complète, avec le tableau de bord technique.
- **Écran tapis** : l'écran seul, en plein écran, tel qu'il sera sur le tapis. Double-clic ou Échap pour revenir.
- Ajouter `?tapis` à l'adresse ouvre directement l'écran tapis ; toucher l'écran lance l'écoute.

## Règles d'écran

- Un seul verset, texte Uthmani blanc sur fond noir.
- Cadre éteint tant que le verset n'est pas identifié, vert pendant la récitation correcte, rouge sur erreur jusqu'à correction.
- Le mot fautif passe en rouge ; le reste du texte reste blanc.
- Dès qu'un verset est validé, le suivant s'affiche, sauf takbīr ou fin de sourate.
- Verset très long : la taille d'écriture est réduite ; au-delà, le verset défile comme un prompteur.

## Tests

```
node tests/engine.test.mjs
```

Les tests chargent le moteur directement depuis `index.html` et rejouent des récitations en texte sur le Coran complet, dans les deux profils (Imam et Fidèle) : récitation normale des 114 sourates, entrée à chacun des 6 236 versets, omission, substitution, ajout, verset sauté, reprise, formules (takbīr, tasmīʿ, istiʿādha, Basmala). Durée : environ 4 minutes.

Ces tests portent sur du texte. Ils ne mesurent pas la qualité de la reconnaissance vocale sur une voix réelle.

## Texte

Texte uthmani : The Noble Qur'an Encyclopedia (quranenc.com), via quran-json, licence CC BY-SA 4.0.
