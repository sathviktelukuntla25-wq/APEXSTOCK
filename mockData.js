/**
 * ApexStock - Royal Luxury Warehouse Datastores
 * Static Seed Data & local storage initializers
 */

const SEED_PRODUCTS = [
  {
    id: "p1",
    name: "Premium Basmati Rice (50kg) (బాస్మతి బియ్యం)",
    sku: "GR-BR-50K",
    barcode: "8901058882315",
    category: "Grains",
    price: 3200,
    stock: 120,
    minStock: 50,
    location: "Royal Vault A - Aisle 2",
    createdDate: "2026-05-10",
    image: "images/rice_bag.svg"
  },
  {
    id: "p3",
    name: "Organic Whole Wheat Flour (25kg) (గోధుమ పిండి)",
    sku: "GR-WF-25K",
    barcode: "8901123004567",
    category: "Grains",
    price: 950,
    stock: 240,
    minStock: 80,
    location: "Royal Vault A - Aisle 4",
    createdDate: "2026-05-10",
    image: "images/rice_bag.svg"
  },
  {
    id: "p2",
    name: "Refined Sunflower Oil (15L) (సన్ ఫ్లవర్ ఆయిల్)",
    sku: "OL-SO-15L",
    barcode: "8901058002315",
    category: "Oils & Spices",
    price: 1850,
    stock: 85,
    minStock: 30,
    location: "Royal Vault B - Aisle 1",
    createdDate: "2026-05-12",
    image: "images/oil_can.svg"
  },
  {
    id: "p4",
    name: "Double Refined Sugar (50kg) (పంచదార)",
    sku: "SU-DR-50K",
    barcode: "8901234567890",
    category: "Oils & Spices",
    price: 2100,
    stock: 35,
    minStock: 60,
    location: "Royal Vault B - Aisle 2",
    createdDate: "2026-05-14",
    image: "images/cardboard_box.svg"
  },
  {
    id: "p5",
    name: "Premium Assam Tea Dust (10kg) (టీ పొడి)",
    sku: "BV-AT-10K",
    barcode: "8901058003312",
    category: "Beverages & Dry Fruits",
    price: 2400,
    stock: 15,
    minStock: 20,
    location: "Luxury Vault C - Aisle 3",
    createdDate: "2026-05-15",
    image: "images/cardboard_box.svg"
  },
  {
    id: "p6",
    name: "Grade A Almonds (10kg) (బాదం పప్పు)",
    sku: "DN-AL-10K",
    barcode: "8901058005514",
    category: "Beverages & Dry Fruits",
    price: 6800,
    stock: 8,
    minStock: 25,
    location: "Luxury Vault C - Aisle 5",
    createdDate: "2026-05-20",
    image: "images/cardboard_box.svg"
  }
];

const SEED_INCOMING = [
  {
    id: "in1",
    supplier: "Deccan Agro Suppliers",
    productName: "Premium Basmati Rice (50kg)",
    quantity: 150,
    eta: "2026-07-06",
    warehouse: "Royal Vault A",
    expiry: "2027-06-30",
    status: "In Transit"
  },
  {
    id: "in2",
    supplier: "Global Oils Ltd",
    productName: "Refined Sunflower Oil (15L)",
    quantity: 100,
    eta: "2026-07-08",
    warehouse: "Royal Vault B",
    expiry: "2027-01-15",
    status: "In Transit"
  },
  {
    id: "in3",
    supplier: "Royal Spices Enterprises",
    productName: "Grade A Almonds (10kg)",
    quantity: 50,
    eta: "2026-07-05",
    warehouse: "Luxury Vault C",
    expiry: "2027-12-31",
    status: "Delayed"
  },
  {
    id: "in4",
    supplier: "Shree Grains Inc",
    productName: "Organic Whole Wheat Flour (25kg)",
    quantity: 200,
    eta: "2026-07-03",
    warehouse: "Royal Vault A",
    expiry: "2026-12-05",
    status: "Arrived"
  }
];

const SEED_OUTGOING = [
  {
    id: "out1",
    destination: "Krishna Super Bazaar, Hyderabad",
    productName: "Organic Whole Wheat Flour (25kg)",
    quantity: 80,
    date: "2026-07-01",
    status: "Delivered"
  },
  {
    id: "out2",
    destination: "Metro Wholesale, Secunderabad",
    productName: "Premium Basmati Rice (50kg)",
    quantity: 60,
    date: "2026-07-03",
    status: "Dispatched"
  },
  {
    id: "out3",
    destination: "Ritz Hotel Group, Gachibowli",
    productName: "Grade A Almonds (10kg)",
    quantity: 15,
    date: "2026-07-04",
    status: "Processing"
  }
];

const SEED_ANOMALIES = [
  {
    date: "2026-07-02",
    product: "Double Refined Sugar (50kg)",
    type: "Mismatch",
    description: "Physical audit counted 34 bags, system logs recorded 35 bags. 1 bag mismatch."
  },
  {
    date: "2026-07-03",
    product: "Refined Sunflower Oil (15L)",
    type: "Temp Spike",
    description: "Cold storage partition 4 recorded 27°C (normal range: 15°C - 20°C)."
  }
];

const SEED_WAREHOUSES = [
  { name: "Royal Vault A", location: "Hyderabad Zones", efficiency: 94, utilization: 82 },
  { name: "Royal Vault B", location: "Vijayawada Hub", efficiency: 88, utilization: 65 },
  { name: "Luxury Vault C", location: "Bengaluru West", efficiency: 76, utilization: 90 }
];
