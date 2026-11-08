import type { Store, V3 } from "./types";

// Shapes as WooCommerce 9 answers them, trimmed to the fields the importer reads.

export const v3Categories: V3.Category[] = [
  { id: 15, name: "Ropa", slug: "ropa", parent: 0, description: "", menu_order: 1, image: null },
  {
    id: 16,
    name: "Camisetas &amp; Polos",
    slug: "camisetas",
    parent: 15,
    description: "<p>Algodón</p>",
    menu_order: 2,
    image: { src: "https://shop.example/wp-content/uploads/camisetas.jpg" },
  },
];

export const v3SimpleProduct: V3.Product = {
  id: 101,
  name: "Taza &#8220;Pura Vida&#8221;",
  slug: "taza-pura-vida",
  permalink: "https://shop.example/producto/taza-pura-vida/",
  type: "simple",
  status: "publish",
  description: "<p>Taza de cerámica</p>",
  short_description: "<p>350 ml</p>",
  sku: "TAZA-01",
  regular_price: "7500",
  sale_price: "5990.50",
  price: "5990.50",
  manage_stock: true,
  stock_quantity: 12,
  stock_status: "instock",
  weight: "0.4",
  categories: [{ id: 15 }],
  images: [{ src: "https://shop.example/wp-content/uploads/taza.jpg", alt: "Taza blanca" }],
  attributes: [],
  variations: [],
  meta_data: [
    { key: "_yoast_wpseo_title", value: "Taza Pura Vida | Hecha en CR" },
    { key: "_yoast_wpseo_metadesc", value: "%%excerpt%%" },
  ],
};

export const v3VariableProduct: V3.Product = {
  id: 102,
  name: "Camiseta Tica",
  slug: "camiseta-tica",
  permalink: "https://shop.example/producto/camiseta-tica/",
  type: "variable",
  status: "draft",
  description: "",
  short_description: "",
  sku: "",
  regular_price: "",
  sale_price: "",
  price: "12000",
  manage_stock: false,
  stock_quantity: null,
  stock_status: "instock",
  weight: "",
  categories: [{ id: 16 }, { id: 15 }],
  images: [],
  attributes: [
    { name: "Talla", options: ["S", "M"], variation: true },
    { name: "Material", options: ["Algodón"], variation: false },
  ],
  variations: [201, 202],
};

export const v3Variations: V3.Variation[] = [
  {
    id: 201,
    sku: "CAM-S",
    regular_price: "12000",
    sale_price: "",
    price: "12000",
    manage_stock: true,
    stock_quantity: 3,
    stock_status: "instock",
    image: null,
    attributes: [{ name: "Talla", option: "S" }],
  },
  {
    id: 202,
    sku: "CAM-M",
    regular_price: "12000",
    sale_price: "",
    price: "12000",
    manage_stock: "parent",
    stock_quantity: null,
    stock_status: "outofstock",
    image: { src: "https://shop.example/wp-content/uploads/cam-m.jpg" },
    attributes: [{ name: "Talla", option: "M" }],
  },
];

export const v3Customers: V3.Customer[] = [
  {
    id: 7,
    email: "Ana@Example.com ",
    first_name: "",
    last_name: "",
    billing: { first_name: "Ana", last_name: "Mora", phone: "8888-0000" },
  },
  { id: 8, email: "", first_name: "Sin", last_name: "Correo" },
];

export const storeCategories: Store.Category[] = [
  {
    id: 15,
    name: "Ropa",
    slug: "ropa",
    parent: 0,
    description: "",
    image: null,
    permalink: "https://shop.example/categoria-producto/ropa/",
  },
];

const crc = (price: string, regular = price): Store.Prices => ({
  price,
  regular_price: regular,
  sale_price: price,
  currency_code: "CRC",
  currency_minor_unit: 0,
});

export const storeVariableProduct: Store.Product = {
  id: 102,
  name: "Camiseta Tica",
  slug: "camiseta-tica",
  permalink: "https://shop.example/producto/camiseta-tica/",
  type: "variable",
  sku: "",
  description: "",
  short_description: "",
  prices: crc("12000"),
  is_in_stock: true,
  images: [],
  categories: [{ id: 15 }],
  attributes: [{ name: "Talla", has_variations: true, terms: [{ name: "S" }, { name: "M" }] }],
  variations: [
    { id: 201, attributes: [{ name: "Talla", value: "S" }] },
    { id: 202, attributes: [{ name: "Talla", value: "M" }] },
  ],
};

export const storeVariation201: Store.Product = {
  ...storeVariableProduct,
  id: 201,
  sku: "CAM-S",
  prices: crc("10000", "12000"),
  attributes: [],
  variations: [],
};

export const storeVariation202: Store.Product = {
  ...storeVariableProduct,
  id: 202,
  sku: "CAM-M",
  prices: crc("12000"),
  is_in_stock: false,
  attributes: [],
  variations: [],
};
