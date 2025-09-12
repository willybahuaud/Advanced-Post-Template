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

      const applySlice = () => {
        const block = select( 'core/block-editor' ).getBlock( clientId );
        if ( ! block ) return;
        const { aptStartFrom: s = 1, aptShowCount: c = 0, aptSkipLast: k = 0 } = block.attributes || {};
        const root = document.querySelector( `[data-block="${ clientId }"]` );
        if ( ! root ) return;
        // Try to find the post-template container rendered in the editor
        const container = root.querySelector( '.wp-block-post-template' ) || root;
        // Prefer elements with the class used for each post item
        let items = Array.from( container.querySelectorAll( '.wp-block-post' ) );
        if ( items.length === 0 ) {
          // Fallback to LI children in case the editor renders a list
          items = Array.from( container.querySelectorAll( 'li' ) );
        }
        const total = items.length;
        items.forEach( ( el ) => el.style.removeProperty( 'display' ) );
        if ( total === 0 ) return;
        const startIndex = Math.max( 0, parseInt( s || 1, 10 ) - 1 );
        const showCount = Math.max( 0, parseInt( c || 0, 10 ) );
        const skipLast = Math.max( 0, parseInt( k || 0, 10 ) );
        const endCap = Math.max( 0, total - skipLast );
        const endIndex = showCount > 0 ? Math.min( startIndex + showCount, endCap ) : endCap; // exclusive
        if ( startIndex >= endIndex ) {
          // Hide all
          items.forEach( ( el ) => ( el.style.display = 'none' ) );
          return;
        }
        items.forEach( ( el, i ) => {
          if ( i < startIndex || i >= endIndex ) {
            el.style.display = 'none';
          }
        } );
      };

      let raf = 0;
      const run = () => {
        if ( raf ) cancelAnimationFrame( raf );
        raf = requestAnimationFrame( applySlice );
      };
      const unsubscribe = subscribe( run );
      // Observe DOM changes within the block to re-apply when preview updates
      const rootEl = () => document.querySelector( `[data-block="${ clientId }"]` );
      const observer = new MutationObserver( () => run() );
      const mountObserver = () => {
        const el = rootEl();
        if ( el ) observer.observe( el, { childList: true, subtree: true } );
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
