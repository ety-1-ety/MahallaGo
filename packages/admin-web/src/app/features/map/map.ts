import {
  Component, ChangeDetectionStrategy, inject, signal, ElementRef, ViewChild,
  AfterViewInit, OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import * as L from 'leaflet';

import { ApiService, type MapShopRow } from '../../core/api/api.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';

const TASHKENT: L.LatLngTuple = [41.3111, 69.2797];

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [MatCardModule, MatProgressSpinnerModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-page">
      <div class="header">
        <h1 class="page-title">{{ 'map.title' | t }}</h1>
        @if (!loading()) {
          <span class="counter">{{ 'map.counter' | t:{ n: shops().length } }}</span>
        }
      </div>

      @if (loading()) {
        <div class="loading"><mat-spinner diameter="32"></mat-spinner></div>
      }

      <div #mapEl class="map" [class.hidden]="loading()"></div>
    </div>
  `,
  styles: [`
    .map-page { display: flex; flex-direction: column; height: 100%; }
    .header { display: flex; align-items: baseline; gap: 16px; padding: 0 24px; }
    .counter { color: var(--mat-sys-on-surface-variant); font-size: 14px; }
    .loading { display: flex; justify-content: center; padding: 80px; }
    .map { flex: 1; min-height: 500px; margin: 16px 24px 24px; border-radius: 12px;
           overflow: hidden; border: 1px solid var(--mat-sys-outline-variant); }
    .map.hidden { display: none; }
    :host ::ng-deep .shop-marker {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 50%;
      background: #1eb53a; color: white; font-size: 18px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      border: 2px solid white;
    }
    :host ::ng-deep .shop-marker.idle { background: #94a3b8; }
    :host ::ng-deep .leaflet-popup-content { font-family: inherit; }
    :host ::ng-deep .leaflet-popup-content a { color: #1eb53a; font-weight: 500; }
  `],
})
export class Map implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) private mapEl!: ElementRef<HTMLDivElement>;

  private readonly api    = inject(ApiService);
  private readonly i18n   = inject(I18nService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly shops   = signal<MapShopRow[]>([]);

  private map?: L.Map;
  private clickListener?: (e: Event) => void;

  async ngAfterViewInit() {
    this.map = L.map(this.mapEl.nativeElement, {
      center: TASHKENT,
      zoom: 12,
      preferCanvas: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    // Перехват кликов по ссылкам в popup'ах для маршрутизации Angular Router'ом.
    this.clickListener = (e: Event) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-shop-id]');
      if (!a) return;
      e.preventDefault();
      this.router.navigate(['/shops', a.dataset['shopId']]);
    };
    this.mapEl.nativeElement.addEventListener('click', this.clickListener);

    try {
      const data = await this.api.activeShopsMap().toPromise();
      this.shops.set(data ?? []);
      this.renderMarkers(data ?? []);
    } finally {
      this.loading.set(false);
      // Карта инициализирована скрытой через .hidden - после показа нужно
      // принудительно пересчитать размеры, иначе тайлы не догружаются.
      setTimeout(() => this.map?.invalidateSize(), 0);
    }
  }

  ngOnDestroy() {
    if (this.clickListener) {
      this.mapEl.nativeElement.removeEventListener('click', this.clickListener);
    }
    this.map?.remove();
  }

  private renderMarkers(shops: MapShopRow[]) {
    if (!this.map) return;

    const acceptingLabel    = this.i18n.t('map.popup.accepting');
    const notAcceptingLabel = this.i18n.t('map.popup.not_accepting');
    const openLabel         = this.i18n.t('map.popup.open');

    const bounds: L.LatLngTuple[] = [];

    for (const s of shops) {
      const icon = L.divIcon({
        className: 'shop-marker' + (s.is_accepting_orders ? '' : ' idle'),
        html: '🏪',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
      });

      const statusEmoji = s.is_accepting_orders ? '🟢' : '🔴';
      const statusText  = s.is_accepting_orders ? acceptingLabel : notAcceptingLabel;
      const safeName    = escapeHtml(s.name);

      const popupHtml = `
        <strong>${safeName}</strong><br>
        <span>${statusEmoji} ${statusText}</span><br>
        <a href="/shops/${s.id}" data-shop-id="${s.id}">${openLabel} →</a>
      `;

      L.marker([s.lat, s.lng], { icon })
        .addTo(this.map)
        .bindPopup(popupHtml);

      bounds.push([s.lat, s.lng]);
    }

    if (bounds.length > 1) {
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else if (bounds.length === 1) {
      this.map.setView(bounds[0], 14);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;'  :
    c === '>' ? '&gt;'  :
    c === '"' ? '&quot;' :
                '&#39;'
  ));
}
