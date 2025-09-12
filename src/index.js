import { __ } from '@wordpress/i18n';
import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { InspectorControls } from '@wordpress/block-editor';
import { useEffect } from '@wordpress/element';
import { select, subscribe } from '@wordpress/data';
import { PanelBody, NumberControl as StableNumberControl, __experimentalNumberControl as ExperimentalNumberControl } from '@wordpress/components';

const NumberControl = StableNumberControl || ExperimentalNumberControl;

const ATTRS = {
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
const withAPTControls = createHigherOrderComponent( ( BlockEdit ) => {
  return ( props ) => {
    if ( props.name !== 'core/post-template' ) {
      return <BlockEdit { ...props } />;
    }
    const { attributes, setAttributes } = props;
    const { aptStartFrom, aptShowCount, aptSkipLast } = attributes;

    // Editor-only DOM slicing (mirror front behavior in the editor preview)
    useEffect( () => {
      const { clientId } = props;
      if ( ! clientId ) return;

      const dbg = ( ...args ) => {
        if ( window.APT_DEBUG ) {
          // eslint-disable-next-line no-console
          console.debug( '[APT]', ...args );
        }
      };

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

      const applySlice = () => {
        const block = select( 'core/block-editor' ).getBlock( clientId );
        if ( ! block ) return;
        const { aptStartFrom: s = 1, aptShowCount: c = 0, aptSkipLast: k = 0 } = block.attributes || {};
        const root = findBlockElement();
        if ( ! root ) {
          dbg( 'root not found for', clientId );
          return;
        }
        // Compute indices (1-based UI -> 0-based index)
        const startIndex = Math.max( 0, parseInt( s || 1, 10 ) - 1 );
        const showCount = Math.max( 0, parseInt( c || 0, 10 ) );
        const skipLast = Math.max( 0, parseInt( k || 0, 10 ) );
        // Generate CSS rules to hide items precisely within this block only
        const doc = root.ownerDocument || document;
        const styleId = `apt-style-${ clientId }`;
        let styleEl = doc.getElementById( styleId );
        if ( ! styleEl ) {
          styleEl = doc.createElement( 'style' );
          styleEl.id = styleId;
          doc.head.appendChild( styleEl );
        }
        const scopeUl = `[data-block=\"${ clientId }\"] ul.wp-block-post-template > li`;
        const scopeOl = `[data-block=\"${ clientId }\"] ol.wp-block-post-template > li`;
        const scopes = `${ scopeUl }, ${ scopeOl }`;
        const rules = [];
        if ( startIndex > 0 ) {
          rules.push( `${ scopes }:nth-child(-n+${ startIndex }){display:none !important;}` );
        }
        if ( showCount > 0 ) {
          const beyond = startIndex + showCount + 1; // CSS nth-child is 1-based
          rules.push( `${ scopes }:nth-child(n+${ beyond }){display:none !important;}` );
        }
        if ( skipLast > 0 ) {
          rules.push( `${ scopes }:nth-last-child(-n+${ skipLast }){display:none !important;}` );
        }
        styleEl.textContent = rules.join( '\n' );
        dbg( 'css rules', styleEl.textContent );
      };

      let raf = 0;
      const run = () => {
        if ( raf ) cancelAnimationFrame( raf );
        raf = requestAnimationFrame( applySlice );
      };
      const unsubscribe = subscribe( run );
      // Observe DOM changes within the block to re-apply when preview updates
      const rootEl = () => findBlockElement();
      const observer = new MutationObserver( () => run() );
      const mountObserver = () => {
        const el = rootEl();
        if ( el ) {
          try {
            observer.observe( el, { childList: true, subtree: true } );
            dbg( 'observer mounted on', clientId );
          } catch (e) {
            dbg( 'observer error', e );
          }
        } else {
          dbg( 'block el not found on mount' );
        }
      };
      mountObserver();
      // Initial run
      dbg( 'effect mounted', clientId );
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
          <PanelBody title={ __( 'Affichage – Tranche', 'advanced-post-template' ) } initialOpen>
            <NumberControl
              label={ __( 'Démarrer à partir du Xème post (1 = premier)', 'advanced-post-template' ) }
              min={ 1 }
              value={ aptStartFrom }
              onChange={ ( val ) => setAttributes( { aptStartFrom: parseInt( val || 1, 10 ) || 1 } ) }
            />
            <NumberControl
              label={ __( 'Afficher X posts (0 = tous possibles)', 'advanced-post-template' ) }
              min={ 0 }
              value={ aptShowCount }
              onChange={ ( val ) => setAttributes( { aptShowCount: Math.max( 0, parseInt( val || 0, 10 ) || 0 ) } ) }
            />
            <NumberControl
              label={ __( 'Ignorer X posts à la fin', 'advanced-post-template' ) }
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
