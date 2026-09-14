<?php
/**
 * Plugin Name:       Forge SEO Connector
 * Plugin URI:        https://forge.example.com/
 * Description:       Unified REST connector that lets the Forge website builder read & write live SEO metadata (title, description, focus keyword, OG/Twitter tags, canonical, robots, JSON-LD) for whichever SEO plugin is active — Yoast SEO, Rank Math, both, or neither. Exposes a Basic-Auth protected <code>forge-seo/v1</code> REST namespace.
 * Version:           1.0.0
 * Author:            Forge
 * Author URI:        https://forge.example.com/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       forge-seo-connector
 * Requires at least: 5.8
 * Requires PHP:      7.2
 *
 * @package Forge_SEO_Connector
 *
 * Architecture:
 *   - forge-seo/v1/status            GET    → reports active SEO plugins + versions
 *   - forge-seo/v1/seo               GET    → reads normalized SEO for ?post_id=N
 *   - forge-seo/v1/seo               POST   → writes normalized SEO for ?post_id=N
 *   - forge-seo/v1/posts             GET    → lists posts with their normalized SEO
 *
 * All routes require Application Password Basic Auth (WP capability: edit_posts
 * for read, edit_post for the specific post on write). No nonce gymnastics —
 * this is a machine-to-machine API meant for the Forge builder.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'FORGE_SEO_VERSION', '1.0.0' );
define( 'FORGE_SEO_FILE', __FILE__ );
define( 'FORGE_SEO_DIR', plugin_dir_path( __FILE__ ) );
define( 'FORGE_SEO_URL', plugin_dir_url( __FILE__ ) );
define( 'FORGE_SEO_NS', 'forge-seo/v1' );

require_once FORGE_SEO_DIR . 'includes/class-detector.php';
require_once FORGE_SEO_DIR . 'includes/class-mapper.php';
require_once FORGE_SEO_DIR . 'includes/class-rest.php';

/**
 * Boot the plugin.
 */
function forge_seo_init() {
	Forge_SEO_Rest::instance();
}
add_action( 'rest_api_init', 'forge_seo_init' );

/**
 * Add a small admin notice pointing users to the REST namespace.
 */
function forge_seo_admin_notice() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$detected = Forge_SEO_Detector::detect();
	$labels   = array();
	if ( $detected['yoast'] ) {
		$labels[] = 'Yoast SEO';
	}
	if ( $detected['rank_math'] ) {
		$labels[] = 'Rank Math';
	}
	$who = $labels ? implode( ' + ', $labels ) : 'no SEO plugin';
	?>
	<div class="notice notice-info is-dismissible">
		<p>
			<strong>Forge SEO Connector</strong> is active and bridging
			<code><?php echo esc_html( $who ); ?></code>.
			REST namespace: <code><?php echo esc_html( FORGE_SEO_NS ); ?></code>.
		</p>
	</div>
	<?php
}
add_action( 'admin_notices', 'forge_seo_admin_notice' );

/**
 * Activation hook: flush rewrite rules so the REST namespace is picked up.
 */
function forge_seo_activate() {
	// REST routes are registered on rest_api_init, nothing else needed.
	flush_rewrite_rules();
}
register_activation_hook( __FILE__, 'forge_seo_activate' );

/**
 * Deactivation hook.
 */
function forge_seo_deactivate() {
	flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'forge_seo_deactivate' );
