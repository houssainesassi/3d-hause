'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  SHOP,
  SHOWROOM_PRODUCTS,
  SHOWROOM_ROOMS,
  findProduct,
  formatPrice,
  publicUrl,
  whatsappLink,
  type ShowroomProduct,
  type ShowroomRoomId,
} from '../lib/showroom/products';
import type { FurnitureItem, RoomLayout } from '../lib/types';
import type * as ThreeNS from 'three';

/** A product piece placed in the house. */
export interface PlacedPiece {
  item: FurnitureItem;
  floorIndex: number;
  product: ShowroomProduct;
}

export function placedPieces(layout: RoomLayout): PlacedPiece[] {
  const out: PlacedPiece[] = [];
  layout.floors.forEach((floor, floorIndex) => {
    for (const item of floor.items) {
      const product = findProduct(item.productId);
      if (product) out.push({ item, floorIndex, product });
    }
  });
  return out;
}

/** How close (m, from the piece's edge) a walker must be to be offered its card. */
const REACH = 1.9;

/** The product piece the walker is near and looking at, if any. */
function pieceInView(camera: ThreeNS.Camera, pieces: readonly PlacedPiece[], floorIndex: number): PlacedPiece | null {
  const m = camera.matrixWorld.elements;
  const cx = m[12];
  const cz = m[14];
  // Camera looks down its local -z.
  const fx = -m[8];
  const fz = -m[10];
  const flen = Math.hypot(fx, fz) || 1;
  let best: PlacedPiece | null = null;
  let bestDistance = Infinity;
  for (const piece of pieces) {
    if (piece.floorIndex !== floorIndex || !piece.item.position) continue;
    const { x, z } = piece.item.position;
    const rotation = piece.item.rotation ?? 0;
    // Nearest point of the piece's footprint, in its own frame.
    const dx = cx - x;
    const dz = cz - z;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const px = Math.max(-piece.item.width / 2, Math.min(piece.item.width / 2, lx));
    const pz = Math.max(-piece.item.depth / 2, Math.min(piece.item.depth / 2, lz));
    const edge = Math.hypot(lx - px, lz - pz);
    if (edge > REACH) continue;
    // Looking roughly toward the piece's centre.
    const distance = Math.hypot(dx, dz) || 1;
    if ((fx * -dx + fz * -dz) / (flen * distance) < 0.5) continue;
    if (edge < bestDistance) {
      best = piece;
      bestDistance = edge;
    }
  }
  return best;
}

function zoneNameAt(layout: RoomLayout, floorIndex: number, camera: ThreeNS.Camera): string | null {
  const m = camera.matrixWorld.elements;
  const x = m[12];
  const z = m[14];
  const zone = layout.floors[floorIndex]?.zones?.find((entry) => x >= entry.x && x <= entry.x + entry.w && z >= entry.z && z <= entry.z + entry.d);
  return zone?.name ?? null;
}

/** The product's original photo, framed to its visible area (letterbox bars left out, nothing else). */
export function ProductPhoto({ product, className }: { product: ShowroomProduct; className?: string }): JSX.Element {
  const crop = product.crop ?? { x: 0, y: 0, w: product.size.w, h: product.size.h };
  return (
    <div className={`rs-photo ${className ?? ''}`} style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, original file served as is */}
      <img
        src={publicUrl(product.image)}
        alt={product.name}
        draggable={false}
        style={{
          width: `${(product.size.w / crop.w) * 100}%`,
          height: `${(product.size.h / crop.h) * 100}%`,
          left: `${(-crop.x / crop.w) * 100}%`,
          top: `${(-crop.y / crop.h) * 100}%`,
        }}
      />
    </div>
  );
}

function WhatsAppIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.85 9.85 0 0 0 12.04 2Zm5.79 14.06c-.24.68-1.42 1.3-1.95 1.34-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.27.24-.27.53-.34.71-.34h.51c.16 0 .38-.06.6.46.23.54.77 1.88.84 2.02.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.7 1.16 1.51 1.88 1.04.93 1.91 1.21 2.18 1.35.27.14.43.11.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.23.61-.14.25.09 1.57.74 1.84.88.27.14.45.2.52.32.07.11.07.66-.17 1.33Z" />
    </svg>
  );
}

export interface ShowroomHudProps {
  layout: RoomLayout;
  activeFloorIndex: number;
  isReady: boolean;
  walking: boolean;
  cameraRef: RefObject<ThreeNS.PerspectiveCamera | null>;
  /** The product whose card is open. */
  openProductId: string | null;
  onOpenProduct(productId: string | null): void;
  onVisitRoom(room: ShowroomRoomId): void;
  onOverview(): void;
  onStartWalk(): void;
  onExitWalk(): void;
}

export function ShowroomHud(props: ShowroomHudProps): JSX.Element {
  const { layout, activeFloorIndex, isReady, walking, cameraRef, openProductId, onOpenProduct } = props;
  const pieces = useMemo(() => placedPieces(layout), [layout]);
  const [nearby, setNearby] = useState<PlacedPiece | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);

  // While walking: which product the walker is near and facing, and which room they are in.
  useEffect(() => {
    if (!walking) {
      setNearby(null);
      setRoomName(null);
      return;
    }
    const tick = (): void => {
      const camera = cameraRef.current;
      if (!camera) return;
      const found = pieceInView(camera, pieces, activeFloorIndex);
      setNearby((current) => (current?.product.id === found?.product.id ? current : found));
      setRoomName(zoneNameAt(layout, activeFloorIndex, camera));
    };
    tick();
    const id = window.setInterval(tick, 150);
    return () => window.clearInterval(id);
  }, [walking, cameraRef, pieces, activeFloorIndex, layout]);

  // E near a product opens its card (capture phase: before the walkthrough's own E).
  const nearbyRef = useRef(nearby);
  nearbyRef.current = nearby;
  useEffect(() => {
    if (!walking) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== 'KeyE' || event.repeat || openProductId) return;
      const target = nearbyRef.current;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      if (document.pointerLockElement) document.exitPointerLock();
      onOpenProduct(target.product.id);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [walking, openProductId, onOpenProduct]);

  const open = findProduct(openProductId ?? undefined) ?? null;

  return (
    <div className="rs-root">
      <header className="rs-brand rs-glass">
        <span className="rs-brand__mark" aria-hidden="true">R</span>
        <span>
          <span className="rs-brand__name">{SHOP.name}</span>
          <span className="rs-brand__tag">{SHOP.tagline}</span>
        </span>
      </header>

      <a className="rs-contact" href={whatsappLink(null)} target="_blank" rel="noopener noreferrer">
        <WhatsAppIcon />
        <span>Nous contacter</span>
      </a>

      {!walking && (
        <nav className="rs-rooms rs-glass" aria-label="Nos espaces">
          <p className="rs-eyebrow">Nos espaces</p>
          <ul>
            {SHOWROOM_ROOMS.map((room) => {
              const product = SHOWROOM_PRODUCTS.find((entry) => entry.room === room.id);
              if (!product) return null;
              const placed = room.ready && pieces.some((piece) => piece.product.id === product.id);
              return (
                <li key={room.id}>
                  <button
                    type="button"
                    className={`rs-room${placed ? '' : ' rs-room--soon'}`}
                    onClick={() => (placed ? props.onVisitRoom(room.id) : onOpenProduct(product.id))}
                  >
                    <ProductPhoto product={product} className="rs-room__thumb" />
                    <span className="rs-room__text">
                      <span className="rs-room__label">{room.label}</span>
                      <span className="rs-room__name">{product.name}</span>
                      <span className="rs-room__price">{placed ? formatPrice(product.price) : 'Modèle 3D en préparation'}</span>
                    </span>
                  </button>
                  <button type="button" className="rs-link" onClick={() => onOpenProduct(product.id)}>
                    Détails du produit
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="rs-button rs-button--ghost rs-overview" onClick={props.onOverview}>
            Vue d’ensemble
          </button>
        </nav>
      )}

      {!walking && isReady && (
        <div className="rs-cta">
          <button type="button" className="rs-button rs-button--primary" onClick={props.onStartWalk}>
            Commencer la visite
          </button>
          <p className="rs-cta__hint">
            <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> ou <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> pour marcher · souris pour regarder
          </p>
        </div>
      )}

      {walking && (
        <div className="rs-walkbar rs-glass">
          <span className="rs-walkbar__room">{roomName ?? (activeFloorIndex === 0 ? 'Rez-de-chaussée' : 'Étage')}</span>
          <button type="button" className="rs-button rs-button--ghost" onClick={props.onExitWalk}>
            Quitter la visite
          </button>
        </div>
      )}

      {walking && nearby && !open && (
        <button type="button" className="rs-prompt" onClick={() => onOpenProduct(nearby.product.id)}>
          <kbd>E</kbd>
          <span>
            Voir <strong>{nearby.product.name}</strong>
          </span>
        </button>
      )}

      {open && (
        <ProductCard
          product={open}
          onClose={() => onOpenProduct(null)}
          onVisit={walking || !SHOWROOM_ROOMS.find((room) => room.id === open.room)?.ready ? null : () => {
            onOpenProduct(null);
            props.onVisitRoom(open.room);
          }}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  onClose,
  onVisit,
}: {
  product: ShowroomProduct;
  onClose(): void;
  onVisit: (() => void) | null;
}): JSX.Element {
  const room = SHOWROOM_ROOMS.find((entry) => entry.id === product.room);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="rs-backdrop" onClick={onClose}>
      <article
        className="rs-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rs-card-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rs-card__media">
          <ProductPhoto product={product} className="rs-card__photo" />
        </div>
        <div className="rs-card__body">
          <button ref={closeRef} type="button" className="rs-close" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
          <p className="rs-eyebrow">{room?.label}</p>
          <h2 id="rs-card-title" className="rs-card__title">{product.name}</h2>
          <p className="rs-card__ref">Réf. {product.reference}</p>
          <p className="rs-card__price">{formatPrice(product.price)}</p>
          {product.provisional && <p className="rs-card__note">Nom et prix provisoires</p>}
          {room?.ready && (
            <p className="rs-card__model-note">
              Le modèle 3D de la maison est réalisé d’après cette photo : formes, couleurs et finitions
              reproduites au plus près, dimensions indicatives.
            </p>
          )}
          <p className="rs-card__desc">{product.description}</p>
          {product.pieces.length > 0 && (
            <>
              <p className="rs-eyebrow">Composition</p>
              <ul className="rs-card__pieces">
                {product.pieces.map((piece) => (
                  <li key={piece}>{piece}</li>
                ))}
              </ul>
            </>
          )}
          <p className="rs-card__dims">
            <span className="rs-eyebrow">Dimensions</span> {product.dimensions ?? 'Sur demande'}
          </p>

          <div className="rs-card__actions">
            <a className="rs-button rs-button--whatsapp" href={whatsappLink(product)} target="_blank" rel="noopener noreferrer">
              <WhatsAppIcon /> Commander sur WhatsApp
            </a>
            {onVisit && (
              <button type="button" className="rs-button rs-button--ghost" onClick={onVisit}>
                Voir dans la maison
              </button>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
