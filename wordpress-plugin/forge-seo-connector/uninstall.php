<?php
/**
 * Uninstall Forge SEO Connector.
 *
 * Removes ONLY the generic fallback meta we own. We deliberately do NOT
 * delete Yoast or Rank Math meta on uninstall — that's the user's content.
 *
 * @package Forge_SEO_Connector
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

// Delete our generic fallback meta keys only.
$keys = array(
	'_forge_seo_title',
	'_forge_seo_description',
	'_forge_seo_focus_keyword',
	'_forge_seo_keywords',
	'_forge_seo_canonical',
	'_forge_seo_robots',
	'_forge_seo_og_title',
	'_forge_seo_og_description',
	'_forge_seo_og_image',
	'_forge_seo_jsonld',
);

foreach ( $keys as $key ) {
	$wpdb->delete(
		$wpdb->postmeta,
		array( 'meta_key' => $key ),
		array( '%s' )
	);
}
