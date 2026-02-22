/**
 * WPCS MCP Server - Deprecated WordPress Functions Database
 * ~100 commonly used deprecated functions from WP 2.0 through 6.7.
 */
export const DEPRECATED_FUNCTIONS = [
    // WP 2.x - 3.x
    { name: 'get_settings', replacement: 'get_option()', since: '2.1' },
    { name: 'wp_setcookie', replacement: 'wp_set_auth_cookie()', since: '2.5' },
    { name: 'get_alloptions', replacement: 'wp_load_alloptions()', since: '3.0' },
    { name: 'get_the_author_email', replacement: 'get_the_author_meta(\'email\')', since: '2.8' },
    { name: 'the_author_email', replacement: 'the_author_meta(\'email\')', since: '2.8' },
    { name: 'get_the_author_login', replacement: 'get_the_author_meta(\'login\')', since: '2.8' },
    { name: 'get_author_name', replacement: 'get_the_author_meta(\'display_name\')', since: '2.8' },
    { name: 'get_catname', replacement: 'get_cat_name()', since: '3.0' },
    { name: 'register_sidebar_widget', replacement: 'wp_register_sidebar_widget()', since: '2.8' },
    { name: 'register_widget_control', replacement: 'wp_register_widget_control()', since: '2.8' },
    { name: 'get_profile', replacement: 'get_the_author_meta()', since: '3.0' },
    { name: 'is_taxonomy', replacement: 'taxonomy_exists()', since: '3.0' },
    { name: 'is_term', replacement: 'term_exists()', since: '3.0' },
    { name: 'is_plugin_page', replacement: 'global $plugin_page and check manually', since: '3.1' },
    { name: 'update_usermeta', replacement: 'update_user_meta()', since: '3.0' },
    { name: 'get_usermeta', replacement: 'get_user_meta()', since: '3.0' },
    { name: 'get_user_by_email', replacement: 'get_user_by(\'email\', $email)', since: '3.3' },
    { name: 'get_userdatabylogin', replacement: 'get_user_by(\'login\', $login)', since: '3.3' },
    { name: 'set_current_user', replacement: 'wp_set_current_user()', since: '3.0' },
    { name: 'clean_url', replacement: 'esc_url()', since: '3.0' },
    { name: 'attribute_escape', replacement: 'esc_attr()', since: '2.8' },
    { name: 'js_escape', replacement: 'esc_js()', since: '2.8' },
    { name: 'wp_specialchars', replacement: 'esc_html()', since: '2.8' },
    // WP 3.x
    { name: 'get_bloginfo_rss', replacement: 'get_bloginfo() with appropriate filters', since: '3.0' },
    { name: 'get_currentuserinfo', replacement: 'wp_get_current_user()', since: '3.1' },
    { name: 'like_escape', replacement: '$wpdb->esc_like()', since: '3.6' },
    { name: 'wp_htmledit_pre', replacement: 'format_for_editor()', since: '3.3' },
    { name: 'wp_richedit_pre', replacement: 'format_for_editor()', since: '3.3' },
    { name: 'the_editor', replacement: 'wp_editor()', since: '3.3' },
    { name: 'get_theme_data', replacement: 'wp_get_theme()', since: '3.4' },
    { name: 'get_themes', replacement: 'wp_get_themes()', since: '3.4' },
    { name: 'get_current_theme', replacement: 'wp_get_theme()', since: '3.4' },
    { name: 'update_page_cache', replacement: 'update_post_cache()', since: '3.4' },
    { name: 'clean_page_cache', replacement: 'clean_post_cache()', since: '3.4' },
    { name: 'wpdb::escape', replacement: '$wpdb->prepare()', since: '3.6' },
    // WP 4.x
    { name: 'get_currentuserinfo', replacement: 'wp_get_current_user()', since: '4.5' },
    { name: 'get_current_site', replacement: 'get_network()', since: '4.6' },
    { name: 'force_ssl_login', replacement: 'force_ssl_admin()', since: '4.4' },
    { name: 'wp_get_http', replacement: 'wp_safe_remote_get()', since: '4.4' },
    { name: 'preview_theme', replacement: 'wp_customize_url()', since: '4.3' },
    { name: 'wp_get_sites', replacement: 'get_sites()', since: '4.6' },
    { name: 'create_empty_blog', replacement: 'wpmu_create_blog()', since: '4.0' },
    { name: 'get_admin_users_for_domain', replacement: 'get_users() with role parameter', since: '4.4' },
    { name: 'wp_embed_handler_googlevideo', replacement: 'removed', since: '4.0' },
    { name: 'format_to_post', replacement: 'removed', since: '4.0' },
    { name: 'popuplinks', replacement: 'removed', since: '4.0' },
    { name: 'post_permalink', replacement: 'get_permalink()', since: '4.4' },
    { name: 'is_comments_popup', replacement: 'removed', since: '4.5' },
    { name: 'wp_no_robots', replacement: 'wp_robots_no_robots()', since: '4.5' },
    { name: 'has_meta', replacement: 'get_post_meta()', since: '4.5' },
    { name: 'image_resize', replacement: 'wp_get_image_editor()->resize()', since: '3.5' },
    { name: 'wp_get_http_headers', replacement: 'wp_remote_head()', since: '4.4' },
    { name: 'rich_edit_exists', replacement: 'removed', since: '4.0' },
    { name: 'default_topic_count_text', replacement: 'removed', since: '4.0' },
    { name: 'get_the_author_aim', replacement: 'removed', since: '4.0' },
    { name: 'get_the_author_icq', replacement: 'removed', since: '4.0' },
    { name: 'get_the_author_msn', replacement: 'removed', since: '4.0' },
    { name: 'get_the_author_yim', replacement: 'removed', since: '4.0' },
    // WP 5.x
    { name: 'wp_install_maybe_enable_pretty_permalinks', replacement: 'removed', since: '5.0' },
    { name: 'wp_make_content_images_responsive', replacement: 'wp_filter_content_tags()', since: '5.5' },
    { name: 'attachment_url_to_postid', replacement: 'attachment_url_to_postid() (use correctly)', since: '5.0' },
    { name: 'is_ssl', replacement: 'is_ssl() still valid, but set_url_scheme() preferred', since: '5.0' },
    { name: 'update_blog_details', replacement: 'wp_update_site()', since: '5.1' },
    { name: 'wp_count_sites', replacement: 'get_sites() with count', since: '5.3' },
    { name: 'wp_refresh_post_nonces', replacement: 'removed', since: '5.3' },
    { name: 'insert_blog', replacement: 'wp_insert_site()', since: '5.1' },
    { name: 'install_blog', replacement: 'wp_install_defaults()', since: '5.1' },
    { name: 'wpmu_welcome_notification', replacement: 'removed', since: '5.1' },
    { name: '_excerpt_render_inner_columns_blocks', replacement: 'removed', since: '5.2' },
    { name: 'wp_targeted_link_rel', replacement: 'wp_init_targeted_link_rel_filters()', since: '5.1' },
    { name: 'wp_get_user_request_data', replacement: 'wp_get_user_request()', since: '5.4' },
    // WP 5.9 - 6.x
    { name: 'block_core_navigation_get_menu_items_at_location', replacement: 'removed', since: '5.9' },
    { name: 'wp_check_widget_editor_deps', replacement: 'removed', since: '5.8' },
    { name: 'get_page_by_title', replacement: 'WP_Query with title parameter', since: '6.2' },
    { name: 'wp_no_robots', replacement: 'wp_robots_no_robots()', since: '5.7' },
    { name: 'wp_sensitive_page_meta', replacement: 'wp_robots_sensitive_page()', since: '5.7' },
    { name: '_wp_upload_dir', replacement: 'wp_get_upload_dir()', since: '5.7' },
    { name: 'wp_lucky_search_link', replacement: 'removed', since: '6.0' },
    { name: 'the_block_template_skip_link', replacement: 'wp_enqueue_block_template_skip_link()', since: '6.4' },
    { name: 'get_page', replacement: 'get_post()', since: '6.2' },
    { name: 'wp_cache_reset', replacement: 'wp_cache_flush()', since: '3.5' },
    { name: 'wp_old_slug_redirect', replacement: 'wp_old_slug_redirect() still valid but check usage', since: '6.0' },
    // Common misuses / very-old functions people still copy from tutorials
    { name: 'mysql_query', replacement: '$wpdb->query() or $wpdb->prepare()', since: '3.9' },
    { name: 'mysql_real_escape_string', replacement: '$wpdb->prepare()', since: '3.9' },
    { name: 'ereg', replacement: 'preg_match()', since: '5.3' },
    { name: 'eregi', replacement: 'preg_match() with i flag', since: '5.3' },
    { name: 'split', replacement: 'explode() or preg_split()', since: '5.3' },
    { name: 'session_register', replacement: '$_SESSION directly', since: '5.4' },
    { name: 'magic_quotes_runtime', replacement: 'removed', since: '5.3' },
    // WP 6.3+
    { name: 'wp_cache_set_sites_last_changed', replacement: 'wp_cache_set_last_changed()', since: '6.3' },
    { name: 'wp_ajax_inline_save', replacement: 'removed', since: '6.3' },
    { name: 'get_post_stati', replacement: 'get_post_stati() still valid but review usage', since: '6.3' },
    { name: 'block_core_navigation_parse_blocks_from_menu_items', replacement: 'removed', since: '6.3' },
];
/**
 * Build a quick lookup map: functionName -> DeprecatedFunction
 */
export function buildDeprecatedMap() {
    const map = new Map();
    for (const fn of DEPRECATED_FUNCTIONS) {
        map.set(fn.name, fn);
    }
    return map;
}
//# sourceMappingURL=wp-deprecated.js.map