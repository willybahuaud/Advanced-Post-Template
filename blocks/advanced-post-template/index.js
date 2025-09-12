/* global wp */
(function (wp) {
  const { registerBlockType } = wp.blocks;
  const { __ } = wp.i18n;
  const { InspectorControls, InnerBlocks } = wp.blockEditor || wp.editor;
  const { PanelBody, NumberControl } = wp.components;

  registerBlockType('wabeo/advanced-post-template', {
    title: __('Advanced Post Template', 'advanced-post-template'),
    description: __(
      "Affiche une tranche des résultats de la Query Loop parent (démarrer à X, afficher Y, ignorer Z à la fin)",
      'advanced-post-template'
    ),
    icon: 'list-view',
    category: 'theme',
    supports: {
      reusable: false,
      html: false,
      inserter: true
    },
    attributes: {
      startFrom: { type: 'number', default: 1 },
      showCount: { type: 'number', default: 0 },
      skipLast: { type: 'number', default: 0 }
    },
    edit: (props) => {
      const { attributes, setAttributes } = props;
      const { startFrom, showCount, skipLast } = attributes;

      return [
        wp.element.createElement(
          InspectorControls,
          {},
          wp.element.createElement(
            PanelBody,
            { title: __('Réglages d’affichage', 'advanced-post-template'), initialOpen: true },
            wp.element.createElement(NumberControl, {
              label: __('Démarrer à partir du Xème post (1 = premier)', 'advanced-post-template'),
              value: startFrom,
              min: 1,
              onChange: (val) => setAttributes({ startFrom: parseInt(val || 1, 10) || 1 })
            }),
            wp.element.createElement(NumberControl, {
              label: __('Afficher X posts (0 = tous possibles)', 'advanced-post-template'),
              value: showCount,
              min: 0,
              onChange: (val) => setAttributes({ showCount: Math.max(0, parseInt(val || 0, 10) || 0) })
            }),
            wp.element.createElement(NumberControl, {
              label: __('Ignorer X posts à la fin', 'advanced-post-template'),
              value: skipLast,
              min: 0,
              onChange: (val) => setAttributes({ skipLast: Math.max(0, parseInt(val || 0, 10) || 0) })
            })
          )
        ),
        wp.element.createElement(
          'div',
          { className: 'wp-block-post-template is-root-container' },
          // Inner blocks structure identical to core/post-template
          wp.element.createElement(InnerBlocks, {
            renderAppender: InnerBlocks.ButtonBlockAppender,
          })
        )
      ];
    },
    save: () => {
      return wp.element.createElement(InnerBlocks.Content, null);
    }
  });
})(window.wp);

