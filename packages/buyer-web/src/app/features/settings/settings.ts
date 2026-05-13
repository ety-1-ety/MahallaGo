import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TelegramService } from '../../core/telegram/telegram.service';
import { LocaleService, Locale } from '../../core/i18n/locale.service';
import { AuthService } from '../../core/auth/auth.service';
import { TPipe } from '../../core/i18n/t.pipe';

@Component({
  selector: 'buyer-settings',
  standalone: true,
  imports: [CommonModule, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="appbar">
      <button class="btn btn-ghost" style="min-height:36px;padding:0 12px" (click)="back()">←</button>
      <div class="title">{{ 'miniapp.common.language' | t }}</div>
    </header>

    <div class="list">
      <button class="card tappable" [class.chip-primary]="locale.current() === 'uz'" (click)="setLang('uz')">
        <div class="flex justify-between items-center">
          <span class="h3">{{ 'miniapp.common.language_uz' | t }}</span>
          @if (locale.current() === 'uz') { <span class="chip chip-primary">✓</span> }
        </div>
      </button>
      <button class="card tappable" [class.chip-primary]="locale.current() === 'ru'" (click)="setLang('ru')">
        <div class="flex justify-between items-center">
          <span class="h3">{{ 'miniapp.common.language_ru' | t }}</span>
          @if (locale.current() === 'ru') { <span class="chip chip-primary">✓</span> }
        </div>
      </button>
    </div>
  `,
})
export class SettingsPage implements OnInit, OnDestroy {
  readonly locale = inject(LocaleService);
  private readonly auth = inject(AuthService);
  private readonly tg = inject(TelegramService);
  private readonly router = inject(Router);

  ngOnInit() { this.tg.showBackButton(() => this.back()); }
  ngOnDestroy() { this.tg.hideBackButton(); }

  back() { this.tg.haptic('selection'); this.router.navigateByUrl('/'); }
  async setLang(l: Locale) {
    this.tg.haptic('selection');
    await this.auth.changeLanguage(l);
  }
}
