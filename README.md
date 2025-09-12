# Advanced Post Template (WordPress)

Une petite extension, très ciblée, du bloc core « Post Template » pour découper l’affichage d’une Query Loop, sans ré‑inventer la roue.

- Ignorer X posts au début
- Afficher ensuite X posts (0 = tout ce qui reste)
- Ignorer X posts à la fin

Auteur : [Willy Bahuaud](https://wabeo.fr)

## Installation

1. Copier le dossier du plugin dans `wp-content/plugins/advanced-post-template` (c’est déjà le cas dans votre setup Local).
2. Activer le plugin depuis l’admin WordPress.

Le plugin ajoute des attributs au bloc `core/post-template` et filtre son rendu côté serveur (front). Côté éditeur (FSE), j’applique un masquage non destructif pour que la prévisualisation colle au rendu réel.

## Utilisation

Dans l’éditeur :

1. Insérez un bloc « Query Loop ».
2. Sélectionnez le bloc « Post Template » à l’intérieur.
3. Dans la sidebar, un panneau « Tronquer l’affichage » apparaît :
   - « Tronquer au début »
   - « Maximum à afficher » (0 = autant que possible)
   - « Tronquer à la fin »

Exemples d’agencements sur une même page :

- En haut de page, afficher les 3 premiers items : start=0, show=3
- Plus bas, afficher le reste sans les 2 derniers : start=4, show=0, skipLast=2

## Détails techniques

- On ne remplace rien : on étend le `core/post-template`, donc vos styles de thème continuent de s’appliquer.
- Le rendu côté serveur découpe la liste courante de la Query Loop par index (base 0 en interne).
- Pagination : si la Query Loop pagine, la découpe s’applique au « lot » de la page courante.
- Éditeur : l’aperçu masque uniquement les éléments « hors tranche » (sans toucher au contenu), et ne révèle jamais ce que l’éditeur masque déjà. Chaque bloc est ciblé précisément, même avec plusieurs Query Loop à la suite.

### Attributs (ajoutés au bloc core/post-template)

- `aptStartFrom` (number, défaut 0) : nombre d’éléments ignorés au début de lot.
- `aptShowCount` (number, défaut 0) : nombre d’éléments à afficher (0 = pas de limite jusqu’à la coupe de fin).
- `aptSkipLast` (number, défaut 0) : nombre d’éléments ignorés en fin de lot.

## Développement

Le plugin utilise `@wordpress/scripts` pour compiler le JS d’extension.

- PHP : `advanced-post-template.php` (enregistrement + override du render core pour la tranche)
- JS : `src/index.js` (HOC en JSX, ajoute le panneau et l’aperçu découpé)
- Build : `build/index.js` (chargé automatiquement dans l’éditeur)

Commandes :

```
npm install
npm run start   # watcher de développement
npm run build   # build de production
```

Petit rappel : on n’ajoute pas de nouveau bloc, on ne casse pas vos templates. On étend le natif, proprement.

## Compatibilité

- WordPress ≥ 6.3
- PHP ≥ 7.4

## Licence

GPL‑2.0‑or‑later
