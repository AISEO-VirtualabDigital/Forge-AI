<?php
/**
 * Mapper: translates between Forge's normalized SEO payload and the raw
 * meta keys used by Yoast SEO and Rank Math.
 *
 * @package Forge_SEO_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class Forge_SEO_Mapper
 */
class Forge_SEO_Mapper {

	/**
	 * Read normalized SEO data for a post.
	 *
	 * @param int $post_id Post ID.
	 * @return array Normalized SEO payload.
	 */
	public static function read( $post_id ) {
		$post_id = absint( $post_id );
		if ( ! $post_id || ! get_post( $post_id ) ) {
			return array();
		}

		$detected = Forge_SEO_Detector::detect();

		// Rank Math takes priority for reads when both are active because its
		// values are raw (not variable-substituted like Yoast's rendered output).
		if ( $detected['rank_math'] ) {
			return self::read_rank_math( $post_id );
		}
		if ( $detected['yoast'] ) {
			return self::read_yoast( $post_id );
		}
		return self::read_generic( $post_id );
	}

	/**
	 * Write normalized SEO data for a post.
	 *
	 * When both Yoast and Rank Math are active, writes go to BOTH so the two
	 * plugins stay in sync. When only one is active, only that one is written.
	 * When neither is active, values land in generic post meta so they are not
	 * lost.
	 *
	 * @param int   $post_id Post ID.
	 * @param array $seo     Normalized SEO payload (see Forge's SeoConfig type).
	 * @return array Summary of what was written.
	 */
	public static function write( $post_id, $seo ) {
		$post_id = absint( $post_id );
		$seo     = is_array( $seo ) ? $seo : array();

		if ( ! $post_id || ! get_post( $post_id ) ) {
			return array( 'error' => 'invalid_post_id' );
		}

		$detected = Forge_SEO_Detector::detect();
		$written  = array();

		if ( $detected['yoast'] ) {
			self::write_yoast( $post_id, $seo );
			$written[] = 'yoast';
		}
		if ( $detected['rank_math'] ) {
			self::write_rank_math( $post_id, $seo );
			$written[] = 'rank_math';
		}
		if ( empty( $written ) ) {
			self::write_generic( $post_id, $seo );
			$written[] = 'generic';
		}

		return array(
			'written_to' => $written,
			'post_id'    => $post_id,
		);
	}

	// ---------------------------------------------------------------------
	// READERS
	// ---------------------------------------------------------------------

	/**
	 * Read from Rank Math post meta.
	 *
	 * @param int $post_id Post ID.
	 * @return array
	 */
	private static function read_rank_math( $post_id ) {
		$robots_raw = get_post_meta( $post_id, 'rank_math_robots', true );
		$robots     = is_array( $robots_raw ) ? $robots_raw : array();

		$noindex  = in_array( 'noindex', $robots, true ) ? 'noindex' : 'index';
		$nofollow = in_array( 'nofollow', $robots, true ) ? 'nofollow' : 'follow';

		// Canonical.
		$canonical = get_post_meta( $post_id, 'rank_math_canonical_url', true );
		if ( ! $canonical ) {
			$canonical = wp_get_canonical_url( $post_id );
		}

		// Schema (Rank Math stores one schema object per post).
		$schema_raw = '';
		$schemas    = get_post_meta( $post_id, 'rank_math_schema_Article', true );
		if ( ! $schemas ) {
			$schemas = get_post_meta( $post_id, 'rank_math_schema_WebPage', true );
		}
		if ( ! $schemas ) {
			// Try to grab any rank_math_schema_* key.
			$all = get_post_meta( $post_id );
			foreach ( $all as $k => $v ) {
				if ( strpos( $k, 'rank_math_schema_' ) === 0 && ! empty( $v[0] ) ) {
					$schemas = maybe_unserialize( $v[0] );
					break;
				}
			}
		}
		if ( $schemas ) {
			$decoded    = is_string( $schemas ) ? json_decode( $schemas, true ) : $schemas;
			$schema_raw = $decoded ? wp_json_encode( $decoded ) : (string) $schemas;
		}

		return self::normalize(
			array(
				'title'             => get_post_meta( $post_id, 'rank_math_title', true ),
				'description'       => get_post_meta( $post_id, 'rank_math_description', true ),
				'focusKeyword'      => get_post_meta( $post_id, 'rank_math_focus_keyword', true ),
				'keywords'          => get_post_meta( $post_id, 'rank_math_focus_keyword', true ),
				'canonical'         => $canonical,
				'robots'            => trim( $noindex . ', ' . $nofollow, ', ' ),
				'ogTitle'            => get_post_meta( $post_id, 'rank_math_facebook_title', true ),
				'ogDescription'      => get_post_meta( $post_id, 'rank_math_facebook_description', true ),
				'ogImage'            => get_post_meta( $post_id, 'rank_math_facebook_image', true ),
				'ogType'             => 'website',
				'twitterCard'        => 'summary_large_image',
				'twitterSite'        => '',
				'twitterTitle'       => get_post_meta( $post_id, 'rank_math_twitter_title', true ),
				'twitterDescription' => get_post_meta( $post_id, 'rank_math_twitter_description', true ),
				'twitterImage'       => get_post_meta( $post_id, 'rank_math_twitter_image', true ),
				'jsonLd'             => $schema_raw,
				'author'             => get_the_author_meta( 'display_name', get_post_field( 'post_author', $post_id ) ),
				'lang'               => get_bloginfo( 'language' ),
			),
			$post_id
		);
	}

	/**
	 * Read from Yoast post meta.
	 *
	 * @param int $post_id Post ID.
	 * @return array
	 */
	private static function read_yoast( $post_id ) {
		$noindex_raw = get_post_meta( $post_id, '_yoast_wpseo_meta-robots-noindex', true );
		// Yoast stores: 1 = noindex, 2 = index, 0 = inherit (default index).
		$noindex  = ( '1' === (string) $noindex_raw ) ? 'noindex' : 'index';
		$nofollow = get_post_meta( $post_id, '_yoast_wpseo_meta-robots-nofollow', true );
		$nofollow = ( '1' === (string) $nofollow ) ? 'nofollow' : 'follow';

		$canonical = get_post_meta( $post_id, '_yoast_wpseo_canonical', true );
		if ( ! $canonical ) {
			$canonical = wp_get_canonical_url( $post_id );
		}

		// Schema — Yoast builds the graph at runtime; we expose the article/page type.
		$article_type = get_post_meta( $post_id, '_yoast_wpseo_schema_article_type', true );
		$page_type    = get_post_meta( $post_id, '_yoast_wpseo_schema_page_type', true );
		$schema_raw   = '';
		if ( $article_type || $page_type ) {
			$schema_raw = wp_json_encode(
				array(
					'@context'   => 'https://schema.org',
					'@type'      => $article_type ?: ( $page_type ?: 'WebPage' ),
					'headline'   => get_post_meta( $post_id, '_yoast_wpseo_title', true ) ?: get_the_title( $post_id ),
				)
			);
		}

		return self::normalize(
			array(
				'title'             => get_post_meta( $post_id, '_yoast_wpseo_title', true ),
				'description'       => get_post_meta( $post_id, '_yoast_wpseo_metadesc', true ),
				'focusKeyword'      => get_post_meta( $post_id, '_yoast_wpseo_focuskw', true ),
				'keywords'          => get_post_meta( $post_id, '_yoast_wpseo_focuskw', true ),
				'canonical'         => $canonical,
				'robots'            => trim( $noindex . ', ' . $nofollow, ', ' ),
				'ogTitle'            => get_post_meta( $post_id, '_yoast_wpseo_opengraph-title', true ),
				'ogDescription'      => get_post_meta( $post_id, '_yoast_wpseo_opengraph-description', true ),
				'ogImage'            => get_post_meta( $post_id, '_yoast_wpseo_opengraph-image', true ),
				'ogType'             => 'website',
				'twitterCard'        => 'summary_large_image',
				'twitterSite'        => '',
				'twitterTitle'       => get_post_meta( $post_id, '_yoast_wpseo_twitter-title', true ),
				'twitterDescription' => get_post_meta( $post_id, '_yoast_wpseo_twitter-description', true ),
				'twitterImage'       => get_post_meta( $post_id, '_yoast_wpseo_twitter-image', true ),
				'jsonLd'             => $schema_raw,
				'author'             => get_the_author_meta( 'display_name', get_post_field( 'post_author', $post_id ) ),
				'lang'               => get_bloginfo( 'language' ),
			),
			$post_id
		);
	}

	/**
	 * Read using generic post meta when no SEO plugin is active.
	 *
	 * @param int $post_id Post ID.
	 * @return array
	 */
	private static function read_generic( $post_id ) {
		return self::normalize(
			array(
				'title'             => get_post_meta( $post_id, '_forge_seo_title', true ),
				'description'       => get_post_meta( $post_id, '_forge_seo_description', true ),
				'focusKeyword'      => get_post_meta( $post_id, '_forge_seo_focus_keyword', true ),
				'keywords'          => get_post_meta( $post_id, '_forge_seo_keywords', true ),
				'canonical'         => get_post_meta( $post_id, '_forge_seo_canonical', true ) ?: wp_get_canonical_url( $post_id ),
				'robots'            => get_post_meta( $post_id, '_forge_seo_robots', true ) ?: 'index, follow',
				'ogTitle'            => get_post_meta( $post_id, '_forge_seo_og_title', true ),
				'ogDescription'      => get_post_meta( $post_id, '_forge_seo_og_description', true ),
				'ogImage'            => get_post_meta( $post_id, '_forge_seo_og_image', true ),
				'ogType'             => 'website',
				'twitterCard'        => 'summary_large_image',
				'twitterSite'        => '',
				'twitterTitle'       => '',
				'twitterDescription' => '',
				'twitterImage'       => '',
				'jsonLd'             => get_post_meta( $post_id, '_forge_seo_jsonld', true ),
				'author'             => get_the_author_meta( 'display_name', get_post_field( 'post_author', $post_id ) ),
				'lang'               => get_bloginfo( 'language' ),
			),
			$post_id
		);
	}

	/**
	 * Normalize: fill in missing fields from WP post data and ensure consistent
	 * types matching Forge's SeoConfig TypeScript interface.
	 *
	 * @param array $seo     Raw SEO data.
	 * @param int   $post_id Post ID.
	 * @return array
	 */
	private static function normalize( $seo, $post_id ) {
		$post = get_post( $post_id );

		// Fallbacks.
		$seo['title']       = $seo['title'] ?: get_the_title( $post_id );
		$seo['description'] = $seo['description'] ?: wp_trim_words( wp_strip_all_tags( $post->post_content ), 30, '…' );
		$seo['ogTitle']     = $seo['ogTitle'] ?: $seo['title'];
		$seo['ogDescription'] = $seo['ogDescription'] ?: $seo['description'];
		$seo['canonical']   = $seo['canonical'] ?: get_permalink( $post_id );
		$seo['robots']      = $seo['robots'] ?: 'index, follow';
		$seo['ogType']      = $seo['ogType'] ?: 'website';
		$seo['twitterCard'] = in_array( $seo['twitterCard'], array( 'summary', 'summary_large_image' ), true ) ? $seo['twitterCard'] : 'summary_large_image';

		// Add post metadata for the Forge UI.
		$seo['__post'] = array(
			'id'         => $post_id,
			'title'      => get_the_title( $post_id ),
			'slug'       => $post->post_name,
			'status'     => $post->post_status,
			'link'       => get_permalink( $post_id ),
			'type'       => $post->post_type,
			'date'       => $post->post_date_gmt,
			'modified'   => $post->post_modified_gmt,
		);

		return $seo;
	}

	// ---------------------------------------------------------------------
	// WRITERS
	// ---------------------------------------------------------------------

	/**
	 * Write to Yoast post meta.
	 *
	 * @param int   $post_id Post ID.
	 * @param array $seo     Normalized SEO.
	 */
	private static function write_yoast( $post_id, $seo ) {
		self::set_meta( $post_id, '_yoast_wpseo_title', isset( $seo['title'] ) ? $seo['title'] : '' );
		self::set_meta( $post_id, '_yoast_wpseo_metadesc', isset( $seo['description'] ) ? $seo['description'] : '' );
		self::set_meta( $post_id, '_yoast_wpseo_focuskw', isset( $seo['focusKeyword'] ) ? $seo['focusKeyword'] : '' );
		self::set_meta( $post_id, '_yoast_wpseo_canonical', isset( $seo['canonical'] ) ? $seo['canonical'] : '' );

		// Robots.
		$robots = isset( $seo['robots'] ) ? strtolower( $seo['robots'] ) : 'index, follow';
		$noindex  = ( false !== strpos( $robots, 'noindex' ) ) ? '1' : '2';
		$nofollow = ( false !== strpos( $robots, 'nofollow' ) ) ? '1' : '0';
		self::set_meta( $post_id, '_yoast_wpseo_meta-robots-noindex', $noindex );
		self::set_meta( $post_id, '_yoast_wpseo_meta-robots-nofollow', $nofollow );

		// Open Graph.
		self::set_meta( $post_id, '_yoast_wpseo_opengraph-title', isset( $seo['ogTitle'] ) ? $seo['ogTitle'] : '' );
		self::set_meta( $post_id, '_yoast_wpseo_opengraph-description', isset( $seo['ogDescription'] ) ? $seo['ogDescription'] : '' );
		self::set_meta( $post_id, '_yoast_wpseo_opengraph-image', isset( $seo['ogImage'] ) ? $seo['ogImage'] : '' );

		// Twitter.
		self::set_meta( $post_id, '_yoast_wpseo_twitter-title', isset( $seo['twitterTitle'] ) ? $seo['twitterTitle'] : '' );
		self::set_meta( $post_id, '_yoast_wpseo_twitter-description', isset( $seo['twitterDescription'] ) ? $seo['twitterDescription'] : '' );
		self::set_meta( $post_id, '_yoast_wpseo_twitter-image', isset( $seo['twitterImage'] ) ? $seo['twitterImage'] : '' );

		// Schema.
		if ( ! empty( $seo['jsonLd'] ) ) {
			$decoded = json_decode( $seo['jsonLd'], true );
			if ( $decoded && isset( $decoded['@type'] ) ) {
				$type = is_array( $decoded['@type'] ) ? $decoded['@type'][0] : $decoded['@type'];
				self::set_meta( $post_id, '_yoast_wpseo_schema_article_type', $type );
			}
		}
	}

	/**
	 * Write to Rank Math post meta.
	 *
	 * @param int   $post_id Post ID.
	 * @param array $seo     Normalized SEO.
	 */
	private static function write_rank_math( $post_id, $seo ) {
		self::set_meta( $post_id, 'rank_math_title', isset( $seo['title'] ) ? $seo['title'] : '' );
		self::set_meta( $post_id, 'rank_math_description', isset( $seo['description'] ) ? $seo['description'] : '' );
		self::set_meta( $post_id, 'rank_math_focus_keyword', isset( $seo['focusKeyword'] ) ? $seo['focusKeyword'] : '' );
		self::set_meta( $post_id, 'rank_math_canonical_url', isset( $seo['canonical'] ) ? $seo['canonical'] : '' );

		// Robots — Rank Math stores as serialized array of directive strings.
		$robots = isset( $seo['robots'] ) ? strtolower( $seo['robots'] ) : 'index, follow';
		$directives = array();
		$directives[] = ( false !== strpos( $robots, 'noindex' ) ) ? 'noindex' : 'index';
		$directives[] = ( false !== strpos( $robots, 'nofollow' ) ) ? 'nofollow' : 'follow';
		self::set_meta( $post_id, 'rank_math_robots', $directives );

		// Open Graph.
		self::set_meta( $post_id, 'rank_math_facebook_title', isset( $seo['ogTitle'] ) ? $seo['ogTitle'] : '' );
		self::set_meta( $post_id, 'rank_math_facebook_description', isset( $seo['ogDescription'] ) ? $seo['ogDescription'] : '' );
		self::set_meta( $post_id, 'rank_math_facebook_image', isset( $seo['ogImage'] ) ? $seo['ogImage'] : '' );

		// Twitter.
		self::set_meta( $post_id, 'rank_math_twitter_title', isset( $seo['twitterTitle'] ) ? $seo['twitterTitle'] : '' );
		self::set_meta( $post_id, 'rank_math_twitter_description', isset( $seo['twitterDescription'] ) ? $seo['twitterDescription'] : '' );
		self::set_meta( $post_id, 'rank_math_twitter_image', isset( $seo['twitterImage'] ) ? $seo['twitterImage'] : '' );

		// Schema — store the JSON-LD under rank_math_schema_Article (Rank Math's
		// default schema type).
		if ( ! empty( $seo['jsonLd'] ) ) {
			self::set_meta( $post_id, 'rank_math_schema_Article', $seo['jsonLd'] );
		}
	}

	/**
	 * Write to generic post meta when no SEO plugin is active.
	 *
	 * @param int   $post_id Post ID.
	 * @param array $seo     Normalized SEO.
	 */
	private static function write_generic( $post_id, $seo ) {
		self::set_meta( $post_id, '_forge_seo_title', isset( $seo['title'] ) ? $seo['title'] : '' );
		self::set_meta( $post_id, '_forge_seo_description', isset( $seo['description'] ) ? $seo['description'] : '' );
		self::set_meta( $post_id, '_forge_seo_focus_keyword', isset( $seo['focusKeyword'] ) ? $seo['focusKeyword'] : '' );
		self::set_meta( $post_id, '_forge_seo_keywords', isset( $seo['keywords'] ) ? $seo['keywords'] : '' );
		self::set_meta( $post_id, '_forge_seo_canonical', isset( $seo['canonical'] ) ? $seo['canonical'] : '' );
		self::set_meta( $post_id, '_forge_seo_robots', isset( $seo['robots'] ) ? $seo['robots'] : 'index, follow' );
		self::set_meta( $post_id, '_forge_seo_og_title', isset( $seo['ogTitle'] ) ? $seo['ogTitle'] : '' );
		self::set_meta( $post_id, '_forge_seo_og_description', isset( $seo['ogDescription'] ) ? $seo['ogDescription'] : '' );
		self::set_meta( $post_id, '_forge_seo_og_image', isset( $seo['ogImage'] ) ? $seo['ogImage'] : '' );
		self::set_meta( $post_id, '_forge_seo_jsonld', isset( $seo['jsonLd'] ) ? $seo['jsonLd'] : '' );
	}

	/**
	 * Update post meta, deleting the key entirely when the value is empty so
	 * we don't litter the postmeta table.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $key     Meta key.
	 * @param mixed  $value   Meta value.
	 */
	private static function set_meta( $post_id, $key, $value ) {
		if ( '' === $value || null === $value ) {
			delete_post_meta( $post_id, $key );
			return;
		}
		// Rank Math stores rank_math_robots as an array; sanitize.
		if ( 'rank_math_robots' === $key ) {
			if ( ! is_array( $value ) ) {
				$value = array( $value );
			}
			$value = array_values( array_filter( array_map( 'strval', $value ) ) );
			if ( empty( $value ) ) {
				delete_post_meta( $post_id, $key );
				return;
			}
		}
		update_post_meta( $post_id, $key, wp_slash( $value ) );
	}
}
