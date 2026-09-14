<?php
/**
 * REST controller: exposes the forge-seo/v1 namespace.
 *
 * @package Forge_SEO_Connector
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class Forge_SEO_Rest
 */
class Forge_SEO_Rest {

	const NS = 'forge-seo/v1';

	/**
	 * Singleton.
	 *
	 * @var Forge_SEO_Rest|null
	 */
	private static $instance = null;

	/**
	 * Get the singleton instance.
	 *
	 * @return Forge_SEO_Rest
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor: registers routes.
	 */
	private function __construct() {
		register_rest_route(
			self::NS,
			'/status',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'status' ),
				'permission_callback' => array( $this, 'permission_read' ),
			)
		);

		register_rest_route(
			self::NS,
			'/seo',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'seo_get' ),
				'permission_callback' => array( $this, 'permission_read' ),
				'args'                => array(
					'post_id' => array(
						'required'          => true,
						'validate_callback' => array( $this, 'validate_post_id' ),
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			self::NS,
			'/seo',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'seo_put' ),
				'permission_callback' => array( $this, 'permission_write' ),
				'args'                => array(
					'post_id' => array(
						'required'          => true,
						'validate_callback' => array( $this, 'validate_post_id' ),
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			self::NS,
			'/posts',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'posts_list' ),
				'permission_callback' => array( $this, 'permission_read' ),
				'args'                => array(
					'per_page' => array(
						'default'           => 20,
						'sanitize_callback' => 'absint',
					),
					'page'     => array(
						'default'           => 1,
						'sanitize_callback' => 'absint',
					),
					'search'   => array(
						'default'           => '',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);
	}

	// ---------------------------------------------------------------------
	// Permission callbacks
	// ---------------------------------------------------------------------

	/**
	 * Read permission: requires a logged-in user (Application Password basic auth)
	 * with edit_posts capability.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return bool|WP_Error
	 */
	public function permission_read( $request ) {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'forge_seo_not_authenticated',
				__( 'Forge SEO Connector requires authentication. Use a WordPress Application Password with Basic Auth.', 'forge-seo-connector' ),
				array( 'status' => 401 )
			);
		}
		if ( ! current_user_can( 'edit_posts' ) ) {
			return new WP_Error(
				'forge_seo_forbidden',
				__( 'Your account does not have permission to read SEO data.', 'forge-seo-connector' ),
				array( 'status' => 403 )
			);
		}
		return true;
	}

	/**
	 * Write permission: requires edit_post for the specific post.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return bool|WP_Error
	 */
	public function permission_write( $request ) {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'forge_seo_not_authenticated',
				__( 'Forge SEO Connector requires authentication. Use a WordPress Application Password with Basic Auth.', 'forge-seo-connector' ),
				array( 'status' => 401 )
			);
		}
		$post_id = absint( $request->get_param( 'post_id' ) );
		if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error(
				'forge_seo_forbidden',
				__( 'Your account cannot edit this post.', 'forge-seo-connector' ),
				array( 'status' => 403 )
			);
		}
		return true;
	}

	/**
	 * Validate that a post ID exists and is readable.
	 *
	 * @param mixed $value Post ID.
	 * @return bool
	 */
	public function validate_post_id( $value ) {
		$post_id = absint( $value );
		if ( ! $post_id ) {
			return false;
		}
		$post = get_post( $post_id );
		return ( $post instanceof WP_Post );
	}

	// ---------------------------------------------------------------------
	// Endpoints
	// ---------------------------------------------------------------------

	/**
	 * GET /forge-seo/v1/status — reports active SEO plugins.
	 *
	 * @return WP_REST_Response
	 */
	public function status() {
		$detected = Forge_SEO_Detector::detect();

		return new WP_REST_Response(
			array(
				'plugin_version'    => FORGE_SEO_VERSION,
				'wordpress_version' => get_bloginfo( 'version' ),
				'site_name'         => get_bloginfo( 'name' ),
				'site_url'          => home_url(),
				'active_plugins'    => array(
					'yoast'      => $detected['yoast'],
					'rank_math'  => $detected['rank_math'],
				),
				'versions'          => array(
					'yoast'      => $detected['yoast_version'],
					'rank_math'  => $detected['rank_math_version'],
				),
				'primary'           => $detected['primary'],
				'endpoints'         => array(
					'status' => '/' . self::NS . '/status',
					'seo_get' => '/' . self::NS . '/seo?post_id=N',
					'seo_put' => '/' . self::NS . '/seo?post_id=N (POST)',
					'posts'  => '/' . self::NS . '/posts',
				),
			),
			200
		);
	}

	/**
	 * GET /forge-seo/v1/seo?post_id=N — read normalized SEO.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function seo_get( $request ) {
		$post_id = absint( $request->get_param( 'post_id' ) );
		$seo     = Forge_SEO_Mapper::read( $post_id );

		if ( empty( $seo ) ) {
			return new WP_Error(
				'forge_seo_post_not_found',
				__( 'Post not found.', 'forge-seo-connector' ),
				array( 'status' => 404 )
			);
		}

		return new WP_REST_Response(
			array(
				'post_id' => $post_id,
				'seo'     => $seo,
			),
			200
		);
	}

	/**
	 * POST /forge-seo/v1/seo?post_id=N — write normalized SEO.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function seo_put( $request ) {
		$post_id = absint( $request->get_param( 'post_id' ) );
		$body    = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		// Only known fields are accepted; everything else is ignored.
		$allowed = array(
			'title',
			'description',
			'keywords',
			'focusKeyword',
			'canonical',
			'robots',
			'ogTitle',
			'ogDescription',
			'ogImage',
			'ogType',
			'twitterCard',
			'twitterSite',
			'twitterTitle',
			'twitterDescription',
			'twitterImage',
			'jsonLd',
			'author',
			'lang',
		);
		$clean = array();
		foreach ( $allowed as $key ) {
			if ( array_key_exists( $key, $body ) ) {
				$value = $body[ $key ];
				// Strings: trim. JSON-LD: validate JSON.
				if ( is_string( $value ) ) {
					$value = trim( $value );
				}
				if ( 'jsonLd' === $key && '' !== $value ) {
					$decoded = json_decode( $value, true );
					if ( null === $decoded && JSON_ERROR_NONE !== json_last_error() ) {
						return new WP_Error(
							'forge_seo_invalid_jsonld',
							__( 'jsonLd must be valid JSON.', 'forge-seo-connector' ),
							array( 'status' => 400 )
						);
					}
				}
				$clean[ $key ] = $value;
			}
		}

		$result = Forge_SEO_Mapper::write( $post_id, $clean );

		if ( isset( $result['error'] ) ) {
			return new WP_Error(
				'forge_seo_write_failed',
				$result['error'],
				array( 'status' => 400 )
			);
		}

		// Re-read so the caller sees the persisted values.
		$seo = Forge_SEO_Mapper::read( $post_id );

		return new WP_REST_Response(
			array(
				'success'    => true,
				'post_id'    => $post_id,
				'written_to' => $result['written_to'],
				'seo'        => $seo,
			),
			200
		);
	}

	/**
	 * GET /forge-seo/v1/posts — list posts with their normalized SEO.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public function posts_list( $request ) {
		$per_page = min( max( absint( $request->get_param( 'per_page' ) ), 1 ), 50 );
		$page     = max( absint( $request->get_param( 'page' ) ), 1 );
		$search   = $request->get_param( 'search' );

		$args = array(
			'post_type'      => 'post',
			'post_status'    => array( 'publish', 'draft', 'private', 'pending' ),
			'posts_per_page' => $per_page,
			'paged'          => $page,
			'orderby'        => 'modified',
			'order'          => 'DESC',
		);
		if ( $search ) {
			$args['s'] = $search;
		}

		$query = new WP_Query( $args );
		$posts = array();

		foreach ( $query->posts as $p ) {
			$seo     = Forge_SEO_Mapper::read( $p->ID );
			$posts[] = array(
				'id'     => $p->ID,
				'title'  => get_the_title( $p ),
				'slug'   => $p->post_name,
				'status' => $p->post_status,
				'link'   => get_permalink( $p ),
				'date'   => $p->post_date_gmt,
				'modified' => $p->post_modified_gmt,
				'seo'    => $seo,
			);
		}

		return new WP_REST_Response(
			array(
				'posts'      => $posts,
				'total'      => (int) $query->found_posts,
				'total_pages' => (int) $query->max_num_pages,
				'page'       => $page,
				'per_page'   => $per_page,
			),
			200
		);
	}
}
