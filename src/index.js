// Étend core/post-template avec des réglages de tranche
// et applique la même découpe dans l’éditeur (aperçu FSE fidèle).
import { __ } from '@wordpress/i18n';
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { InspectorControls } from '@wordpress/block-editor';
import { useEffect } from '@wordpress/element';
import { select, subscribe } from '@wordpress/data';
import { PanelBody, NumberControl as StableNumberControl, __experimentalNumberControl as ExperimentalNumberControl } from '@wordpress/components';

// NumberControl fallback selon la version de WordPress
const NumberControl = StableNumberControl || ExperimentalNumberControl;

const ATTRS = {
  // 1-based côté UI pour rester aligné avec l’expérience core
  aptStartFrom: { type: 'number', default: 0 },
  aptShowCount: { type: 'number', default: 0 },
  aptSkipLast: { type: 'number', default: 0 },
};

// 1) Extend attributes of core/post-template
addFilter(
  'blocks.registerBlockType',
  'wabeo/apt-extend-attrs',
  ( settings, name ) => {
    if ( name !== 'core/post-template' ) return settings;
    return {
      ...settings,
      attributes: {
        ...settings.attributes,
        ...ATTRS,
      },
    };
  }
);

// ---
// Gestion globale: utilitaires + subscribe pour créer/supprimer des observateurs
// ---

/**
 * Trouve l’élément DOM du bloc dans le document ou dans l’iframe du canvas.
 * @param {string} clientId
 * @returns {HTMLElement|null}
 */
const findBlockElement = ( clientId ) => {
  if ( ! clientId ) return null;
  // Normal document first
  let el = document.querySelector( `[data-block="${ clientId }"]` );
  if ( el ) return el;
  // Try canvas iframes (Site Editor / Editor iframe mode)
  const frames = Array.from( document.querySelectorAll( 'iframe[name="editor-canvas"], .editor-canvas iframe, iframe.components-iframe__frame' ) );
  for ( const fr of frames ) {
    try {
      const doc = fr.contentDocument || fr.contentWindow?.document;
      if ( ! doc ) continue;
      el = doc.querySelector( `[data-block="${ clientId }"]` );
      if ( el ) return el;
    } catch (e) {
      // ignore
    }
  }
  return null;
};

/**
 * Trouve la liste de prévisualisation (ul/ol.wp-block-post-template) pour ce bloc.
 * @param {HTMLElement} root
 * @returns {HTMLUListElement|HTMLOListElement|null}
 */
const findListElement = ( root ) => {
  if ( ! root ) return null;
  if ( root.matches && root.matches( 'ul.wp-block-post-template, ol.wp-block-post-template' ) ) {
    return root;
  }
  return root.querySelector( 'ul.wp-block-post-template, ol.wp-block-post-template' );
};

/**
 * Crée ou met à jour une balise <style> scoping le clientId.
 */
const setScopedStyle = ( clientId, doc, cssText ) => {
  if ( ! doc ) return;
  const id = `apt-style-${ clientId }`;
  let style = doc.getElementById( id );
  if ( ! style ) {
    style = doc.createElement( 'style' );
    style.type = 'text/css';
    style.id = id;
    ( doc.head || doc.documentElement ).appendChild( style );
  }
  style.textContent = cssText || '';
};

/**
 * Supprime la balise <style> pour ce clientId dans un document donné.
 */
const removeScopedStyle = ( clientId, doc ) => {
  if ( ! doc ) return;
  const el = doc.getElementById( `apt-style-${ clientId }` );
  if ( el ) el.remove();
};

/**
 * Retourne les LI visibles (enfants directs) et nettoie nos masquages précédents.
 * Compte uniquement les éléments effectivement visibles (display != none).
 */
const getVisibleItems = ( listEl ) => {
  if ( ! listEl ) return [];
  const allLis = Array.from( listEl.children ).filter( ( el ) => el.tagName === 'LI' );
  allLis.forEach( ( el ) => {
    if ( el.dataset && el.dataset.aptHidden === '1' ) {
      delete el.dataset.aptHidden;
    }
  } );
  return allLis.filter( ( el ) => {
    const cs = ( el.ownerDocument || document ).defaultView.getComputedStyle( el );
    return cs && cs.display !== 'none';
  } );
};

/** Applique la découpe via CSS dans l’aperçu éditeur. */
const applySlice = ( clientId ) => {
  if ( ! clientId ) return;
  // Utilise le store de la fenêtre du canvas si disponible
  const root = findBlockElement( clientId );
  const w = ( root && ( root.ownerDocument || {} ).defaultView ) || window;
  const dataSelect = ( w && w.wp && w.wp.data && w.wp.data.select ) ? w.wp.data.select : select;
  const block = dataSelect( 'core/block-editor' ).getBlock( clientId );
  if ( ! block ) return;
  const { aptStartFrom: s = 0, aptShowCount: c = 0, aptSkipLast: k = 0 } = block.attributes || {};
  // root peut être null si le DOM n'est pas encore prêt
  if ( ! root ) return;
  const doc = root.ownerDocument || document;

  // Règle CSS unique: on masque uniquement nos LI marqués data-apt-hidden="1"
  const base = `[data-block="${ clientId }"]`;
  const listSel = `${ base } ul.wp-block-post-template, ${ base } ol.wp-block-post-template, ${ base }.wp-block-post-template`;
  const itemSel = `${ listSel } > li[data-apt-hidden="1"]`;
  setScopedStyle( clientId, doc, `${ itemSel }{display:none !important;}` );

  // Localise la liste et calcule les éléments visibles
  const listEl = findListElement( root );
  if ( ! listEl ) return;
  const visibleLis = getVisibleItems( listEl );
  const total = visibleLis.length;
  if ( total === 0 ) return;

  // Indices en 0-based (aptStartFrom = s éléments à ignorer au début)
  const startIndex = Math.max( 0, parseInt( s || 0, 10 ) );
  const showCount = Math.max( 0, parseInt( c || 0, 10 ) );
  const skipLast = Math.max( 0, parseInt( k || 0, 10 ) );
  const endCap = Math.max( 0, total - skipLast );
  const endIndex = showCount > 0 ? Math.min( startIndex + showCount, endCap ) : endCap; // exclusive

  // Marque uniquement les visibles hors plage, le CSS s'occupe du masquage
  visibleLis.forEach( ( el, i ) => {
    if ( i < startIndex || i >= endIndex ) {
      if ( el.dataset ) el.dataset.aptHidden = '1';
    }
  } );
};

// Store simple observers per clientId to avoid duplicates.
const observers = new Map();
const prevAttrs = new Map();

const ensureObserver = ( clientId ) => {
  if ( observers.has( clientId ) ) return;
  let raf = 0;
  const run = () => {
    if ( raf ) cancelAnimationFrame( raf );
    raf = requestAnimationFrame( () => applySlice( clientId ) );
  };

  const observer = new MutationObserver( () => run() );
  let observerMounted = false;
  let mountTimer = 0;
  const mountObserver = () => {
    const rootEl = findBlockElement( clientId );
    if ( ! rootEl ) {
      return false;
    }
    const target = findListElement( rootEl ) || rootEl;
    try {
      observer.observe( target, { childList: true, subtree: true } );
      observerMounted = true;
      return true;
    } catch (e) {
      return false;
    }
  };

  if ( ! mountObserver() ) {
    let attempts = 0;
    const tryMount = () => {
      attempts += 1;
      if ( observerMounted || attempts > 40 ) return; // ~10s avec pas de 250ms
      if ( ! mountObserver() ) {
        mountTimer = window.setTimeout( tryMount, 250 );
      } else {
        run();
      }
    };
    mountTimer = window.setTimeout( tryMount, 250 );
  }

  // Initial run
  run();

  observers.set( clientId, {
    disconnect: () => {
      if ( raf ) cancelAnimationFrame( raf );
      observer.disconnect();
      if ( mountTimer ) window.clearTimeout( mountTimer );
    },
  } );
};

const cleanupObservers = ( activeClientIds ) => {
  // Remove any observers for clientIds that no longer exist
  Array.from( observers.keys() ).forEach( ( id ) => {
    if ( ! activeClientIds.has( id ) ) {
      const entry = observers.get( id );
      if ( entry && entry.disconnect ) entry.disconnect();
      observers.delete( id );
      prevAttrs.delete( id );
      // Supprime les styles scoppés restants de tous les documents
      removeScopedStyle( id, document );
      const frames = Array.from( document.querySelectorAll( 'iframe[name="editor-canvas"], .editor-canvas iframe, iframe.components-iframe__frame' ) );
      frames.forEach( ( fr ) => {
        const doc = fr.contentDocument || fr.contentWindow?.document;
        if ( doc ) removeScopedStyle( id, doc );
      } );
    }
  } );
};

// Helper pour aplatir l'arbre de blocs (incluant les innerBlocks)
const flattenBlocks = ( blocks ) => {
  const out = [];
  const stack = Array.isArray( blocks ) ? [ ...blocks ] : [];
  while ( stack.length ) {
    const b = stack.shift();
    if ( ! b ) continue;
    out.push( b );
    if ( Array.isArray( b.innerBlocks ) && b.innerBlocks.length ) {
      stack.unshift( ...b.innerBlocks );
    }
  }
  return out;
};

// --- gestion du canvas FSE (iframe) : remonter les observateurs quand il se recharge ---
let lastActiveIds = new Set();
const attachedIframes = new WeakSet();
const frameSubscriptions = new WeakMap();

const setupFrameStore = ( w ) => {
  if ( ! w || ! w.wp || ! w.wp.data || ! w.wp.data.select || ! w.wp.data.subscribe ) return;
  if ( frameSubscriptions.has( w ) ) return; // déjà attaché
  const unsubscribe = w.wp.data.subscribe( () => {
    try {
      const blocks = w.wp.data.select( 'core/block-editor' ).getBlocks();
      if ( ! Array.isArray( blocks ) ) return;
      const all = flattenBlocks( blocks );
      const apt = all.filter( ( b ) => b?.name === 'core/post-template' );
      const activeIds = new Set( apt.map( ( b ) => b.clientId ) );
      apt.forEach( ( b ) => {
        ensureObserver( b.clientId );
        const attrs = {
          s: parseInt( b.attributes?.aptStartFrom || 0, 10 ),
          c: parseInt( b.attributes?.aptShowCount || 0, 10 ),
          k: parseInt( b.attributes?.aptSkipLast || 0, 10 ),
        };
        const prev = prevAttrs.get( b.clientId );
        if ( ! prev || prev.s !== attrs.s || prev.c !== attrs.c || prev.k !== attrs.k ) {
          prevAttrs.set( b.clientId, attrs );
          applySlice( b.clientId );
        }
      } );
      cleanupObservers( activeIds );
      lastActiveIds = new Set( activeIds );
    } catch (e) {
      // ignore
    }
  } );
  frameSubscriptions.set( w, unsubscribe );
};

const remountAllObservers = () => {
  // Déconnecte et nettoie tout
  Array.from( observers.values() ).forEach( ( entry ) => entry.disconnect && entry.disconnect() );
  observers.clear();
  // Remonte sur les IDs connus actifs
  Array.from( lastActiveIds ).forEach( ( id ) => {
    ensureObserver( id );
    applySlice( id );
  } );
};

const attachCanvasListeners = () => {
  const frames = Array.from( document.querySelectorAll( 'iframe[name="editor-canvas"], .editor-canvas iframe, iframe.components-iframe__frame' ) );
  frames.forEach( ( fr ) => {
    if ( attachedIframes.has( fr ) ) return;
    attachedIframes.add( fr );
    fr.addEventListener( 'load', () => {
      // Le canvas a rechargé: détecte les blocs dans le store du canvas et (ré)applique
      const w = fr.contentWindow;
      try {
        if ( w && w.wp && w.wp.data && w.wp.data.select ) {
          const blocks = w.wp.data.select( 'core/block-editor' ).getBlocks();
          const all = flattenBlocks( blocks );
          const apt = all.filter( ( b ) => b?.name === 'core/post-template' );
          lastActiveIds = new Set( apt.map( ( b ) => b.clientId ) );
          apt.forEach( ( b ) => {
            ensureObserver( b.clientId );
            applySlice( b.clientId );
            prevAttrs.set( b.clientId, {
              s: parseInt( b.attributes?.aptStartFrom || 0, 10 ),
              c: parseInt( b.attributes?.aptShowCount || 0, 10 ),
              k: parseInt( b.attributes?.aptSkipLast || 0, 10 ),
            } );
          } );
          // Et s'abonner pour capter les insertions/changements sans reload
          setupFrameStore( w );
        } else {
          // Repli: remonte les observateurs existants
          remountAllObservers();
        }
      } catch (e) {
        remountAllObservers();
      }
    } );
    // Essaye d'attacher immédiatement si l'iframe est déjà prête
    try { if ( fr.contentWindow ) setupFrameStore( fr.contentWindow ); } catch (e) {}
  } );
};

// Observe l'ajout/retrait des iframes pour (ré)attacher le listener load
const canvasHostObserver = new MutationObserver( () => attachCanvasListeners() );
try {
  canvasHostObserver.observe( document.documentElement, { childList: true, subtree: true } );
} catch (e) {
  // noop
}
// Premier passage
attachCanvasListeners();

// Global subscription to block-editor store to mount/refresh observers
subscribe( () => {
  const blocks = select( 'core/block-editor' ).getBlocks();
  if ( ! Array.isArray( blocks ) ) return;
  const allBlocks = flattenBlocks( blocks );
  const aptBlocks = allBlocks.filter( ( b ) => b?.name === 'core/post-template' );
  const activeIds = new Set( aptBlocks.map( ( b ) => b.clientId ) );

  // Ensure observers for current APT blocks
  aptBlocks.forEach( ( b ) => {
    ensureObserver( b.clientId );
    const attrs = {
      s: parseInt( b.attributes?.aptStartFrom || 0, 10 ),
      c: parseInt( b.attributes?.aptShowCount || 0, 10 ),
      k: parseInt( b.attributes?.aptSkipLast || 0, 10 ),
    };
    const prev = prevAttrs.get( b.clientId );
    if ( ! prev || prev.s !== attrs.s || prev.c !== attrs.c || prev.k !== attrs.k ) {
      prevAttrs.set( b.clientId, attrs );
      // Attributes changed -> apply slice now
      applySlice( b.clientId );
    }
  } );

  cleanupObservers( activeIds );
  // Mémorise les IDs actifs courants pour remount sur reload de canvas
  lastActiveIds = new Set( activeIds );
} );

// 2) Add Inspector controls to core/post-template
/**
 * Ajoute un panneau de réglages et applique le slicing dans l’éditeur.
 * @param {import('@wordpress/element').ComponentType<any>} BlockEdit
 * @returns {import('@wordpress/element').ComponentType<any>}
 */
const withAPTControls = createHigherOrderComponent( ( BlockEdit ) => {
  return ( props ) => {
    if ( props.name !== 'core/post-template' ) {
      return <BlockEdit { ...props } />;
    }
    const { attributes, setAttributes } = props;
    const { aptStartFrom, aptShowCount, aptSkipLast } = attributes;

    // L’aperçu est géré globalement; on déclenche une passe initiale côté bloc.
    useEffect( () => {
      if ( props.clientId ) {
        applySlice( props.clientId );
        ensureObserver( props.clientId );
      }
    }, [ props.clientId ] );

    // Recalcule immédiatement lorsque les attributs changent (sans dépendre du store global)
    useEffect( () => {
      if ( props.clientId ) {
        applySlice( props.clientId );
      }
    }, [ props.clientId, aptStartFrom, aptShowCount, aptSkipLast ] );
    return (
      <>
        <BlockEdit { ...props } />
        <InspectorControls>
          <PanelBody title={ __( 'Tronquer l’affichage', 'advanced-post-template' ) } initialOpen>
            <NumberControl
              label={ __( 'Tronquer au début', 'advanced-post-template' ) }
              min={ 0 }
              value={ aptStartFrom }
              onChange={ ( val ) => setAttributes( { aptStartFrom: parseInt( val || 0, 10 ) || 0 } ) }
            />
            <NumberControl
              label={ __( 'Maximum à afficher (0 = tous)', 'advanced-post-template' ) }
              min={ 0 }
              value={ aptShowCount }
              onChange={ ( val ) => setAttributes( { aptShowCount: Math.max( 0, parseInt( val || 0, 10 ) || 0 ) } ) }
            />
            <NumberControl
              label={ __( 'Tronquer à la fin', 'advanced-post-template' ) }
              min={ 0 }
              value={ aptSkipLast }
              onChange={ ( val ) => setAttributes( { aptSkipLast: Math.max( 0, parseInt( val || 0, 10 ) || 0 ) } ) }
            />
          </PanelBody>
        </InspectorControls>
      </>
    );
  };
}, 'withAPTControls' );

addFilter( 'editor.BlockEdit', 'wabeo/apt-controls', withAPTControls );
