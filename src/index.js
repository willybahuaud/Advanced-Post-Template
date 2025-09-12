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
  aptStartFrom: { type: 'number', default: 1 },
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

    // Editor-only DOM slicing (miroir du front dans l’aperçu éditeur)
    useEffect( () => {
      const { clientId } = props;
      if ( ! clientId ) return;

      /**
       * Trouve l’élément DOM du bloc, dans le document ou dans l’iframe du canvas.
       * @returns {HTMLElement|null}
       */
      const findBlockElement = () => {
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
       * Retourne les LI visibles (enfants directs) et retire seulement nos masquages précédents.
       * @param {HTMLElement} listEl
       * @returns {HTMLElement[]}
       */
      const getVisibleItems = ( listEl ) => {
        if ( ! listEl ) return [];
        const allLis = Array.from( listEl.children ).filter( ( el ) => el.tagName === 'LI' );
        allLis.forEach( ( el ) => {
          if ( el.dataset && el.dataset.aptHidden === '1' ) {
            el.style.display = '';
            delete el.dataset.aptHidden;
          }
        } );
        return allLis.filter( ( el ) => {
          const cs = ( el.ownerDocument || document ).defaultView.getComputedStyle( el );
          return cs && cs.display !== 'none';
        } );
      };

      /** Applique la découpe à l’aperçu éditeur (masque les LI hors plage). */
      const applySlice = () => {
        const block = select( 'core/block-editor' ).getBlock( clientId );
        if ( ! block ) return;
        const { aptStartFrom: s = 1, aptShowCount: c = 0, aptSkipLast: k = 0 } = block.attributes || {};
        const root = findBlockElement();
        if ( ! root ) return;
        // Remove any previous CSS-based approach (older versions)
        const doc = root.ownerDocument || document;
        const legacyStyle = doc.getElementById( `apt-style-${ clientId }` );
        if ( legacyStyle ) legacyStyle.remove();

        const listEl = findListElement( root );

        if ( ! listEl ) return;

        const visibleLis = getVisibleItems( listEl );

        const total = visibleLis.length;
        if ( total === 0 ) return;

        // Compute indices (UI en base 1 -> interne base 0) sur la liste visible.
        // parseInt(..., 10) force la base décimale (évite les cas bizarres de chaînes).
        const startIndex = Math.max( 0, parseInt( s || 1, 10 ) - 1 );
        const showCount = Math.max( 0, parseInt( c || 0, 10 ) );
        const skipLast = Math.max( 0, parseInt( k || 0, 10 ) );
        const endCap = Math.max( 0, total - skipLast );
        const endIndex = showCount > 0 ? Math.min( startIndex + showCount, endCap ) : endCap; // exclusive

        // Hide out-of-range on the visible subset only; tag so we can revert later.
        visibleLis.forEach( ( el, i ) => {
          if ( i < startIndex || i >= endIndex ) {
            el.style.display = 'none';
            if ( el.dataset ) el.dataset.aptHidden = '1';
          }
        } );
      };

      let raf = 0;
      /** Déclenche sans bloquer l’UI */
      const run = () => {
        if ( raf ) cancelAnimationFrame( raf );
        raf = requestAnimationFrame( applySlice );
      };
      const unsubscribe = subscribe( run );
      // Observe la liste si possible (moins de bruit), sinon le bloc root
      const observer = new MutationObserver( () => run() );
      const mountObserver = () => {
        const rootEl = findBlockElement();
        if ( ! rootEl ) return;
        const target = findListElement( rootEl ) || rootEl;
        try {
          observer.observe( target, { childList: true, subtree: true } );
        } catch (e) {
          // ignore
        }
      };
      mountObserver();
      // Initial run
      run();
      return () => {
        if ( unsubscribe ) unsubscribe();
        if ( raf ) cancelAnimationFrame( raf );
        observer.disconnect();
      };
    }, [ props.clientId ] );
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
