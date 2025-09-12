# Advanced Post Template (WordPress)

Extension du bloc core « Post Template » pour découper l’affichage d’une Query Loop.

- Démarrer à partir du Xème post (1 = premier)
- Afficher ensuite X posts (0 = tout ce qui reste)
- Ignorer X posts à la fin

Auteur : [Willy Bahuaud](https://wabeo.fr)

## Installation

1. Copier le dossier du plugin dans `wp-content/plugins/advanced-post-template` (c’est déjà le cas dans votre setup Local).
2. Activer le plugin depuis l’admin WordPress.

Le plugin ajoute des attributs au bloc `core/post-template` et filtre son rendu côté serveur.

## Utilisation

Dans l’éditeur :

1. Insérez un bloc « Query Loop ».
2. Remplacez le « Post Template » par « Advanced Post Template ».
3. Réglez dans la sidebar :
   - « Démarrer à partir du Xème post » (1 = premier)
   - « Afficher X posts » (0 = autant que possible)
   - « Ignorer X posts à la fin »

Exemples d’agencements sur une même page :

- En haut de page, afficher les 3 premiers items : start=1, show=3
- Plus bas, afficher le reste sans les 2 derniers : start=4, show=0, skipLast=2

## Détails techniques

- Le bloc suit la structure et les classes du `core/post-template` pour rester compatible avec les styles de thème.
- Le rendu côté serveur découpe la liste courante de la Query Loop par index (base 0 en interne).
- Pagination : si la Query Loop pagine, la découpe s’applique au « lot » de la page courante.

### Attributs

- `startFrom` (number, défaut 1) : point de départ (1‑based côté UI).
- `showCount` (number, défaut 0) : nombre d’éléments à afficher (0 = pas de limite jusqu’à la coupe de fin).
- `skipLast` (number, défaut 0) : nombre d’éléments ignorés en fin de lot.

## Développement

Le plugin utilise `@wordpress/scripts` pour compiler les scripts du bloc.

- PHP : `advanced-post-template.php` (enregistrement + render_callback)
- Sources JS : `src/index.js` (extension du bloc core)
- Build JS : `build/index.js` (chargé automatiquement dans l’éditeur)

Commandes :

```
npm install
npm run start   # watcher de développement
npm run build   # build de production
```

Astuce : si vous ne souhaitez pas builder, un script de secours existe encore dans `blocks/advanced-post-template/index.js`, mais `block.json` pointe désormais vers la version compilée.

## Compatibilité

- WordPress ≥ 6.3
- PHP ≥ 7.4

## Licence

GPL‑2.0‑or‑later
