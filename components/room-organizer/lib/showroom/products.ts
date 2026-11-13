/**
 * Meuble Rayen showroom catalogue: the one place to edit products.
 *
 * In the house, products are 3D models built from the shop's reference
 * photographs (three/builders/builders-rayen-*.ts). The product card shows
 * the ORIGINAL photograph, unmodified; `crop` only hides letterbox bars
 * around it (by CSS — the file itself is never changed).
 *
 * Names, prices, dimensions and the WhatsApp number below are TEMPORARY
 * placeholders until the shop provides the real values.
 */

export type ShowroomRoomId = 'salon' | 'chambre' | 'salle-a-manger';

export interface ShowroomRoom {
  readonly id: ShowroomRoomId;
  /** Shown to customers. */
  readonly label: string;
  /** The storey the room is on (index into the layout's floors). */
  readonly floorIndex: number;
  /** False while the room's 3D furniture is still being modelled. */
  readonly ready: boolean;
  /** The orbit camera's pose for "visit this room" (world metres, y up from the storey's floor). */
  readonly view?: { readonly position: Vec3; readonly target: Vec3 };
}

interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PhotoCrop {
  /** Pixel rectangle of the photo's real content, inside `size`. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ShowroomProduct {
  readonly id: string;
  readonly room: ShowroomRoomId;
  readonly name: string;
  readonly reference: string;
  /** Price in Tunisian dinars; `null` shows "Prix sur demande". */
  readonly price: number | null;
  readonly description: string;
  /** What the set contains, one line per piece. */
  readonly pieces: readonly string[];
  /** Overall dimensions, free text (e.g. "Canapé d'angle 320 × 220 cm"). */
  readonly dimensions: string | null;
  /** Path under /public. */
  readonly image: string;
  /** The image file's pixel size. */
  readonly size: { readonly w: number; readonly h: number };
  /** Visible part of the photo; the whole image when absent. */
  readonly crop?: PhotoCrop;
  /** Marks the values above as placeholders in the product card. */
  readonly provisional: boolean;
}

export const SHOP = {
  name: 'Meuble Rayen',
  tagline: 'Showroom 3D',
  /** International format, digits only (216 = Tunisia). PLACEHOLDER. */
  whatsapp: '21600000000',
  currency: 'DT',
} as const;

export const SHOWROOM_ROOMS: readonly ShowroomRoom[] = [
  {
    id: 'salon',
    label: 'Salon',
    floorIndex: 0,
    ready: true,
    // Standing in the middle of the room at eye level (1.60 m), facing the
    // corner sofa with the velvet sofa on the right, as the photo shows them.
    // The target is a few centimetres ahead, so a drag turns the view on the
    // spot (360°) instead of circling the furniture.
    view: { position: { x: 0, y: 1.6, z: 0 }, target: { x: -0.048, y: 1.585, z: 0.005 } },
  },
  { id: 'salle-a-manger', label: 'Salle à manger', floorIndex: 0, ready: false },
  { id: 'chambre', label: 'Chambre à coucher', floorIndex: 1, ready: false },
];

export const SHOWROOM_PRODUCTS: readonly ShowroomProduct[] = [
  {
    id: 'salon-01',
    room: 'salon',
    name: 'Salon d’angle Velours',
    reference: 'SAL-001',
    price: 5900,
    description:
      'Salon d’angle capitonné beige avec canapé assorti en velours bordeaux, finitions et pieds dorés.',
    pieces: [
      'Canapé d’angle beige (2 modules)',
      'Canapé 3 places velours prune',
      'Coussins décoratifs',
      'Table basse ronde marbre et doré (sur la photo, à confirmer)',
    ],
    dimensions: null,
    image: '/showroom/salon.png',
    size: { w: 867, h: 592 },
    crop: { x: 8, y: 0, w: 858, h: 592 },
    provisional: true,
  },
  {
    id: 'chambre-01',
    room: 'chambre',
    name: 'Chambre à coucher Blanc & Or',
    reference: 'CHA-001',
    price: 7400,
    description:
      'Chambre complète laquée blanche avec liserés dorés et tête de lit capitonnée.',
    pieces: ['Lit double avec tête de lit', 'Armoire 4 portes avec miroirs', 'Commode avec miroir', 'Table de chevet'],
    dimensions: null,
    image: '/showroom/chambre.png',
    size: { w: 650, h: 636 },
    crop: { x: 0, y: 0, w: 643, h: 636 },
    provisional: true,
  },
  {
    id: 'salle-a-manger-01',
    room: 'salle-a-manger',
    name: 'Salle à manger Chêne',
    reference: 'SAM-001',
    price: 3200,
    description: 'Table rectangulaire en bois naturel et six chaises capitonnées en tissu crème.',
    pieces: ['Table rectangulaire', '6 chaises capitonnées'],
    dimensions: null,
    image: '/showroom/salle-a-manger.png',
    size: { w: 867, h: 592 },
    // The source has black bars left and right; only the photo is shown.
    crop: { x: 197, y: 0, w: 480, h: 592 },
    provisional: true,
  },
];

export function findProduct(id: string | undefined): ShowroomProduct | undefined {
  return id === undefined ? undefined : SHOWROOM_PRODUCTS.find((product) => product.id === id);
}

export function productsInRoom(room: ShowroomRoomId): ShowroomProduct[] {
  return SHOWROOM_PRODUCTS.filter((product) => product.room === room);
}

/** Visible width / height of a product's photo. */
export function photoAspect(product: ShowroomProduct): number {
  const crop = product.crop ?? { x: 0, y: 0, w: product.size.w, h: product.size.h };
  return crop.w / crop.h;
}

/** A /public path, under the deployment's base path (GitHub Pages serves under one). */
export function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`;
}

export function formatPrice(price: number | null): string {
  if (price === null) return 'Prix sur demande';
  return `${price.toLocaleString('fr-FR').replace(/ | /g, ' ')} ${SHOP.currency}`;
}

export function whatsappLink(product: ShowroomProduct | null): string {
  const text = product
    ? `Bonjour ${SHOP.name}, je suis intéressé(e) par « ${product.name} » (réf. ${product.reference}) vu dans votre showroom 3D. Pouvez-vous me donner plus d’informations ?`
    : `Bonjour ${SHOP.name}, j’ai visité votre showroom 3D et j’aimerais plus d’informations.`;
  return `https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(text)}`;
}
