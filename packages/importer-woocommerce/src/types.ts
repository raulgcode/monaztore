// The parts of WooCommerce's responses the importer reads. Everything else is ignored.

/** REST API v3 (`/wp-json/wc/v3`), needs a consumer key and secret with read access. */
export namespace V3 {
  export interface Category {
    id: number;
    name: string;
    slug: string;
    parent: number;
    description: string;
    menu_order?: number;
    image: { src: string | false; alt?: string } | null;
  }

  export interface Attribute {
    name: string;
    options: string[];
    variation: boolean;
  }

  export interface MetaData {
    key: string;
    value: unknown;
  }

  export interface Product {
    id: number;
    name: string;
    slug: string;
    permalink: string;
    type: "simple" | "variable" | "grouped" | "external" | string;
    status: "publish" | "draft" | "pending" | "private" | string;
    description: string;
    short_description: string;
    sku: string;
    regular_price: string;
    sale_price: string;
    price: string;
    manage_stock: boolean;
    stock_quantity: number | null;
    stock_status: "instock" | "outofstock" | "onbackorder" | string;
    weight: string;
    categories: { id: number }[];
    images: { src: string | false; alt?: string }[];
    attributes: Attribute[];
    variations: number[];
    meta_data?: MetaData[];
  }

  export interface Variation {
    id: number;
    sku: string;
    regular_price: string;
    sale_price: string;
    price: string;
    manage_stock: boolean | "parent";
    stock_quantity: number | null;
    stock_status: string;
    image: { src: string | false } | null;
    attributes: { name: string; option: string }[];
  }

  export interface Customer {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    billing?: { phone?: string; first_name?: string; last_name?: string };
  }
}

/** Store API (`/wp-json/wc/store/v1`): public, no keys, only what the shop shows visitors. */
export namespace Store {
  export interface Prices {
    price: string;
    regular_price: string;
    sale_price: string;
    currency_code: string;
    currency_minor_unit: number;
  }

  export interface Category {
    id: number;
    name: string;
    slug: string;
    parent: number;
    description: string;
    image: { src: string | false; alt?: string } | null;
    permalink: string;
  }

  export interface Product {
    id: number;
    name: string;
    slug: string;
    permalink: string;
    type: string;
    sku: string;
    description: string;
    short_description: string;
    prices: Prices;
    is_in_stock: boolean;
    images: { src: string | false; alt?: string }[];
    categories: { id: number }[];
    attributes: { name: string; has_variations: boolean; terms: { name: string }[] }[];
    variations: { id: number; attributes: { name: string; value: string }[] }[];
  }
}
