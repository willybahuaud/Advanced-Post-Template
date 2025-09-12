<?php
/**
 * Plugin Name:       Advanced Post Template
 * Description:       Variante du bloc Post Template permettant de découper l'affichage d'une Query Loop (départ, nombre, éléments à ignorer en fin).
 * Author:            Willy Bahuaud
 * Author URI:        https://wabeo.fr
 * Version:           0.1.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Text Domain:       advanced-post-template
 * License:           GPL-2.0-or-later
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Render callback for the Advanced Post Template block.
 *
 * Attributes:
 * - startFrom (int, 1-based): commencer à partir du Xème post.
 * - showCount (int): afficher X posts (0 ou vide = autant que possible).
 * - skipLast (int): ignorer X posts à la fin.
 *
 * Le rendu suit le bloc core/post-template, mais ne rend qu'une tranche des résultats.
 *
 * @param array    $attributes
 * @param string   $content
 * @param WP_Block $block
 * @return string
 */
function wabeo_render_block_advanced_post_template( $attributes, $content, $block ) {
    $page_key            = isset( $block->context['queryId'] ) ? 'query-' . $block->context['queryId'] . '-page' : 'query-page';
    $enhanced_pagination = isset( $block->context['enhancedPagination'] ) && $block->context['enhancedPagination'];
    $page                = empty( $_GET[ $page_key ] ) ? 1 : (int) $_GET[ $page_key ];

    $use_global_query = ( isset( $block->context['query']['inherit'] ) && $block->context['query']['inherit'] );
    if ( $use_global_query ) {
        global $wp_query;
        if ( in_the_loop() ) {
            $query = clone $wp_query;
            $query->rewind_posts();
        } else {
            $query = $wp_query;
        }
    } else {
        if ( ! function_exists( 'build_query_vars_from_query_block' ) ) {
            // Function is available in core since 5.8. Bail safely if missing.
            return '';
        }
        $query_args = build_query_vars_from_query_block( $block, $page );
        $query      = new WP_Query( $query_args );
    }

    if ( ! $query || ! $query->have_posts() ) {
        return '';
    }

    // Compute slicing indices (convert 1-based UI to 0-based index).
    $total_posts = (int) $query->post_count;
    $start_from  = isset( $attributes['startFrom'] ) ? max( 0, (int) $attributes['startFrom'] - 1 ) : 0;
    $show_count  = isset( $attributes['showCount'] ) ? (int) $attributes['showCount'] : 0; // 0 = all
    $skip_last   = isset( $attributes['skipLast'] ) ? max( 0, (int) $attributes['skipLast'] ) : 0;

    $end_cap     = max( 0, $total_posts - $skip_last );
    $end_index   = $show_count > 0 ? min( $start_from + $show_count, $end_cap ) : $end_cap;

    if ( $start_from >= $end_index ) {
        // Rien à afficher.
        return '';
    }

    if ( function_exists( 'block_core_post_template_uses_featured_image' ) && block_core_post_template_uses_featured_image( $block->inner_blocks ) ) {
        update_post_thumbnail_cache( $query );
    }

    $classnames = '';
    if ( isset( $block->context['displayLayout'] ) && isset( $block->context['query'] ) ) {
        if ( isset( $block->context['displayLayout']['type'] ) && 'flex' === $block->context['displayLayout']['type'] ) {
            $columns    = isset( $block->context['displayLayout']['columns'] ) ? $block->context['displayLayout']['columns'] : 3;
            $classnames = "is-flex-container columns-{$columns}";
        }
    }
    if ( isset( $attributes['style']['elements']['link']['color']['text'] ) ) {
        $classnames .= ' has-link-color';
    }
    if ( isset( $attributes['layout']['type'] ) && 'grid' === $attributes['layout']['type'] && ! empty( $attributes['layout']['columnCount'] ) ) {
        $classnames .= ' ' . sanitize_title( 'columns-' . $attributes['layout']['columnCount'] );
    }

    $wrapper_attributes = get_block_wrapper_attributes( array( 'class' => trim( $classnames ) ) );

    $content = '';
    $i       = 0;
    while ( $query->have_posts() ) {
        $query->the_post();
        // Afficher seulement la tranche désirée.
        if ( $i < $start_from ) {
            $i++;
            continue;
        }
        if ( $i >= $end_index ) {
            break;
        }

        $block_instance                 = $block->parsed_block;
        $block_instance['blockName']    = 'core/null';
        $post_id                        = get_the_ID();
        $post_type                      = get_post_type();
        $filter_block_context           = static function ( $context ) use ( $post_id, $post_type ) {
            $context['postType'] = $post_type;
            $context['postId']   = $post_id;
            return $context;
        };
        add_filter( 'render_block_context', $filter_block_context, 1 );
        $block_content = ( new WP_Block( $block_instance ) )->render( array( 'dynamic' => false ) );
        remove_filter( 'render_block_context', $filter_block_context, 1 );

        $post_classes            = implode( ' ', get_post_class( 'wp-block-post' ) );
        $inner_block_directives  = $enhanced_pagination ? ' data-wp-key="post-template-item-' . $post_id . '"' : '';
        $content                .= '<li' . $inner_block_directives . ' class="' . esc_attr( $post_classes ) . '">' . $block_content . '</li>';

        $i++;
    }

    wp_reset_postdata();

    if ( '' === $content ) {
        return '';
    }

    return sprintf(
        '<ul %1$s>%2$s</ul>',
        $wrapper_attributes,
        $content
    );
}

/**
 * Register the block via metadata.
 */
function wabeo_register_advanced_post_template_block() {
    register_block_type(
        __DIR__ . '/blocks/advanced-post-template',
        array(
            'render_callback'   => 'wabeo_render_block_advanced_post_template',
            'skip_inner_blocks' => true,
        )
    );
}
add_action( 'init', 'wabeo_register_advanced_post_template_block' );
