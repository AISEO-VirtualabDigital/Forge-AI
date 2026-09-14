<?php
/**
 * Detector: figures out which SEO plugins are active at runtime.
 *
 * @package Forge_SEO_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class Forge_SEO_Detector
 */
class Forge_SEO_Detector {

	/**
	 * Detect active SEO plugins.
	 *
	 * @return array {
	 *     @type bool   $yoast      Whether Yoast SEO (free or premium) is active.
	 *     @type string $yoast_version
	 *     @type bool   $rank_math  Whether Rank Math is active.
	 *     @type string $rank_math_version
	 *     @type string $primary    'yoast' | 'rank_math' | 'none' — used to pick write target.
	 * }
	 */
	public static function detect() {
		$yoast      = defined( 'WPSEO_VERSION' ) || defined( 'WPSEO_FILE' ) || class_exists( 'WPSEO_Meta' );
		$rank_math  = defined( 'RANK_MATH_VERSION' ) || defined( 'RANK_MATH_FILE' ) || class_exists( 'RankMath' );
		$yoast_ver  = $yoast && defined( 'WPSEO_VERSION' ) ? WPSEO_VERSION : '';
		$rm_ver     = $rank_math && defined( 'RANK_MATH_VERSION' ) ? RANK_MATH_VERSION : '';

		// Prefer Rank Math on write when both are active (it's the newer one),
		// but we still mirror to Yoast too — see Mapper::write for the dual-write.
		$primary = 'none';
		if ( $rank_math ) {
			$primary = 'rank_math';
		} elseif ( $yoast ) {
			$primary = 'yoast';
		}

		return array(
			'yoast'             => $yoast,
			'yoast_version'      => $yoast_ver,
			'rank_math'         => $rank_math,
			'rank_math_version' => $rm_ver,
			'primary'           => $primary,
		);
	}
}
