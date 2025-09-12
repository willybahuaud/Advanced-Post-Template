<?php
/**
 * Plugin Name:       Advanced Post Template
 * Description:       Ajoute des réglages de tranche (départ, nombre, éléments à ignorer en fin) au bloc natif Post Template et filtre son rendu en front.
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
 * Enqueue editor script to extend the native core/post-template block.
 *
 * Loads the compiled JS built with @wordpress/scripts to add extra attributes
 * and the editor-only slicing behavior that mirrors the server render.
 *
 * @return void
 */
function wabeo_apt_enqueue_editor_assets() {
    $asset_file = __DIR__ . '/build/index.asset.php';
    if ( ! file_exists( $asset_file ) ) {
        return;
    }
    $asset = include $asset_file;
    wp_register_script(
        'wabeo-apt-editor',
        plugins_url( 'build/index.js', __FILE__ ),
        isset( $asset['dependencies'] ) ? $asset['dependencies'] : array( 'wp-blocks', 'wp-element', 'wp-components', 'wp-i18n', 'wp-hooks', 'wp-block-editor' ),
        isset( $asset['version'] ) ? $asset['version'] : filemtime( __DIR__ . '/build/index.js' ),
        true
    );
    wp_set_script_translations( 'wabeo-apt-editor', 'advanced-post-template' );
    wp_enqueue_script( 'wabeo-apt-editor' );
}
add_action( 'enqueue_block_editor_assets', 'wabeo_apt_enqueue_editor_assets' );

/**
 * Ensure the script also loads in the Site Editor (FSE) admin screen.
 *
 * Some setups may not trigger enqueue_block_editor_assets reliably for site-editor.php.
 * Hooking admin_enqueue_scripts for that screen makes it more robust.
 *
 * @param string $hook Current admin page hook.
 * @return void
 */
function wabeo_apt_admin_enqueue( $hook ) {
    if ( 'site-editor.php' === $hook ) {
        wabeo_apt_enqueue_editor_assets();
    }
}
add_action( 'admin_enqueue_scripts', 'wabeo_apt_admin_enqueue' );

/**
 * Add custom attributes to core/post-template and override render callback to slice results.
 *
 * Registers the 3 slicing attributes server-side so they are recognized and persisted,
 * and sets our render callback wrapper that mirrors core’s behavior but slices the results.
 *
 * @param array  $args Block type arguments.
 * @param string $name Block name.
 * @return array Filtered block type arguments.
 */
function wabeo_apt_register_core_post_template_attrs( $args, $name ) {
    if ( 'core/post-template' !== $name ) {
        return $args;
    }
    if ( ! isset( $args['attributes'] ) || ! is_array( $args['attributes'] ) ) {
        $args['attributes'] = array();
    }
    $args['attributes']['aptStartFrom'] = array( 'type' => 'number', 'default' => 0 );
    $args['attributes']['aptShowCount'] = array( 'type' => 'number', 'default' => 0 );
    $args['attributes']['aptSkipLast']  = array( 'type' => 'number', 'default' => 0 );

    $args['render_callback'] = 'wabeo_render_core_post_template_sliced';
    return $args;
}
add_filter( 'register_block_type_args', 'wabeo_apt_register_core_post_template_attrs', 10, 2 );

/**
 * Render callback wrapper for core/post-template with slicing logic.
 *
 * If no slicing is requested via attributes, defers to core’s renderer when available.
 * Otherwise it builds the query like core, then renders only the desired slice of items.
 *
 * @param array    $attributes Block attributes, including our apt* keys.
 * @param string   $content    Default content (unused here).
 * @param WP_Block $block      Block instance, with context and inner blocks.
 * @return string              HTML output for the sliced template.
 */
function wabeo_render_core_post_template_sliced( $attributes, $content, $block ) {
    // If no slicing requested, defer to core renderer when available.
    $has_slicing = (
        ( isset( $attributes['aptStartFrom'] ) && (int) $attributes['aptStartFrom'] !== 0 ) ||
        ( isset( $attributes['aptShowCount'] ) && (int) $attributes['aptShowCount'] !== 0 ) ||
        ( isset( $attributes['aptSkipLast'] )  && (int) $attributes['aptSkipLast']  !== 0 )
    );
    if ( ! $has_slicing && function_exists( 'render_block_core_post_template' ) ) {
        return render_block_core_post_template( $attributes, $content, $block );
    }

    $page_key            = isset( $block->context['queryId'] ) ? 'query-' . $block->context['queryId'] . '-page' : 'query-page';
    $enhanced_pagination = ! empty( $block->context['enhancedPagination'] );
    $page                = empty( $_GET[ $page_key ] ) ? 1 : (int) $_GET[ $page_key ];

    $use_global_query = ( isset( $block->context['query']['inherit'] ) && $block->context['query']['inherit'] );
    $used_main_query  = false;
    if ( $use_global_query ) {
        global $wp_query;
        if ( in_the_loop() ) {
            // Match core behavior: clone when already in the loop.
            $query = clone $wp_query;
            $query->rewind_posts();
        } else {
            // Use the main query object, but remember to rewind afterwards
            // so multiple post-template blocks don't affect each other.
            $query            = $wp_query;
            $used_main_query  = true;
        }
    } else {
        if ( ! function_exists( 'build_query_vars_from_query_block' ) ) {
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
    $start_from  = isset( $attributes['aptStartFrom'] ) ? max( 0, (int) $attributes['aptStartFrom'] ) : 0;
    $show_count  = isset( $attributes['aptShowCount'] ) ? (int) $attributes['aptShowCount'] : 0; // 0 = all
    $skip_last   = isset( $attributes['aptSkipLast'] ) ? max( 0, (int) $attributes['aptSkipLast'] ) : 0;

    $end_cap   = max( 0, $total_posts - $skip_last );
    $end_index = $show_count > 0 ? min( $start_from + $show_count, $end_cap ) : $end_cap;

    if ( $start_from >= $end_index ) {
        return '';
    }

    if ( function_exists( 'block_core_post_template_uses_featured_image' ) && block_core_post_template_uses_featured_image( $block->inner_blocks ) ) {
        update_post_thumbnail_cache( $query );
    }

    // Classes like core/post-template.
    $classnames = 'wp-block-post-template';
    if ( isset( $block->context['displayLayout']['type'] ) && 'flex' === $block->context['displayLayout']['type'] ) {
        $columns    = isset( $block->context['displayLayout']['columns'] ) ? $block->context['displayLayout']['columns'] : 3;
        $classnames .= ' is-flex-container columns-' . (int) $columns;
    }
    if ( isset( $attributes['style']['elements']['link']['color']['text'] ) ) {
        $classnames .= ' has-link-color';
    }

    $wrapper_attributes = get_block_wrapper_attributes( array( 'class' => trim( $classnames ) ) );

    $items = '';
    $i     = 0;
    while ( $query->have_posts() ) {
        $query->the_post();
        if ( $i < $start_from ) {
            $i++;
            continue;
        }
        if ( $i >= $end_index ) {
            break;
        }

        $block_instance              = $block->parsed_block;
        $block_instance['blockName'] = 'core/null';
        $post_id                     = get_the_ID();
        $post_type                   = get_post_type();
        $filter_block_context        = static function ( $context ) use ( $post_id, $post_type ) {
            $context['postType'] = $post_type;
            $context['postId']   = $post_id;
            return $context;
        };
        add_filter( 'render_block_context', $filter_block_context, 1 );
        $inner = ( new WP_Block( $block_instance ) )->render( array( 'dynamic' => false ) );
        remove_filter( 'render_block_context', $filter_block_context, 1 );

        $post_classes           = implode( ' ', get_post_class( 'wp-block-post' ) );
        $inner_block_directives = $enhanced_pagination ? ' data-wp-key="post-template-item-' . $post_id . '"' : '';
        $items                 .= '<li' . $inner_block_directives . ' class="' . esc_attr( $post_classes ) . '">' . $inner . '</li>';

        $i++;
    }
    wp_reset_postdata();
    if ( $used_main_query && isset( $query ) && $query instanceof WP_Query ) {
        // Ensure the global query pointer is reset for subsequent blocks.
        $query->rewind_posts();
    }

    if ( '' === $items ) {
        return '';
    }

    return sprintf( '<ul %1$s>%2$s</ul>', $wrapper_attributes, $items );
}
