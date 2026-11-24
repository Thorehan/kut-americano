import Phaser from 'phaser';
import { GameMode, LobbyInfo, RuleOrder, ServerMsg, normalizeCode } from '@kut/core';
import { OnlineController } from '../controller';
import { GAME_H, GAME_W, RENDER_SCALE, UI } from '../layout';
import { connection } from '../net/connection';
import { haptic, sfx } from '../sfx';
import { createTextures } from '../textures';
import { Button } from '../ui/Button';
import { promptText, shareLink } from '../ui/htmlPrompt';
import { panel, txt } from '../ui/text';
import { showBubble } from '../view/SeatView';
import { icon } from '../ui/icons';
import { profile, saveProfile } from '../profile';

export interface LobbyData {
  /** Davet linkinden gelen oda kodu. */
  join?: string;
}

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* depolama yok */
  }
}

export function playerName(): string {
  return profile().name;
}

/** Online odada görünen avatar ve renk (profilden). */
function look() {
  const p = profile();
  return { avatar: p.avatar, color: p.color };
}

/** Online lobi: oda kur / koda katıl / odada bekle, kurucu başlatır. */
export class LobbyScene extends Phaser.Scene {
  private view: Phaser.GameObjects.Container | null = null;
  private status!: Phaser.GameObjects.Text;
  private nameT!: Phaser.GameObjects.Text;
  private lobby: LobbyInfo | null = null;
  private unsub: (() => void)[] = [];
  private createMode: GameMode = 'solo';
  private createOrder: RuleOrder = 'classic';
  private leaving = false;
  /** "Odaya giriliyor…" açılır penceresi ve zaman aşımı. */
  private busy: Phaser.GameObjects.Container | null = null;
  private busyTimer: Phaser.Time.TimerEvent | null = null;
  private busyRetry: (() => void) | null = null;

  constructor() {
    super('lobby');
  }

  create(data: LobbyData) {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_W / 2, GAME_H / 2);
    this.cameras.main.fadeIn(200, 7, 29, 21);
    createTextures(this);
    this.add.image(0, 0, 'menu-bg').setOrigin(0).setScale(1 / RENDER_SCALE);
    this.input.on('pointerdown', () => sfx.unlock());
    this.view = null;
    this.lobby = null;
    this.leaving = false;
    this.busy = null;
    this.busyTimer = null;
    this.createOrder = load('kut-rule-order') === 'random' ? 'random' : 'classic';
    this.createMode = load('kut-last-mode') === 'team' ? 'team' : 'solo';

    // üst çubuk
    new Button(this, 48, 44, 56, 56, '', () => this.backToMenu(), UI.slate).setIcon(icon('back'), 30);
    txt(this, GAME_W / 2, 40, 'ONLINE ODA', 26, UI.goldHex, 900).setOrigin(0.5);
    const g = this.add.graphics();
    panel(g, GAME_W - 296, 12, 280, 56, 28, UI.panel, 0.9, UI.stroke, 1);
    this.nameT = txt(this, GAME_W - 280, 40, '', 17, '#fff', 900).setOrigin(0, 0.5);
    new Button(this, GAME_W - 62, 40, 84, 40, 'Değiştir', () => this.editName(), UI.amber, 13);
    this.nameT.setText(`${profile().avatar} ${playerName()}`);
    this.status = txt(this, GAME_W / 2, 700, '', 15, UI.muted, 800).setOrigin(0.5, 1);

    this.events.once('shutdown', () => {
      this.unsub.forEach((u) => u());
      this.unsub = [];
    });

    if (!connection.available) {
      this.showOffline();
      return;
    }

    this.unsub.push(connection.on((m) => this.onMsg(m)));
    this.unsub.push(
      connection.onStatus((st) => {
        if (st === 'connecting') this.setStatus('Sunucuya bağlanılıyor…');
        else if (st === 'open') this.setStatus('');
        else if (st === 'closed' && !this.leaving) this.setStatus('Bağlantı koptu, yeniden deneniyor…', true);
      }),
    );

    const code = data?.join ? normalizeCode(data.join) : '';
    const session = connection.session;
    if (session) {
      // Yarım kalan oda: aynı odaya bağlan, koltuğu jetonla geri al
      this.setStatus('Odaya geri dönülüyor…');
      this.showBusy('Odaya geri dönülüyor…', () => connection.openRoom(session.code));
      if (connection.status === 'open') connection.send({ t: 'rejoin', ...session });
      else connection.openRoom(session.code);
    } else if (code.length === 4) {
      this.showHome();
      this.join(code);
    } else {
      this.showHome();
    }
  }

  private setStatus(s: string, warn = false) {
    this.status.setText(s).setColor(warn ? UI.redHex : UI.muted);
  }

  private onMsg(m: ServerMsg) {
    if (m.t === 'lobby' || m.t === 'state' || m.t === 'error' || m.t === 'left') this.hideBusy();
    if (m.t === 'lobby') {
      this.lobby = m.lobby;
      if (!m.lobby.started) this.showRoom(m.lobby);
    } else if (m.t === 'state') {
      // Oyun başladı (ya da oyuna geri dönüldü)
      if (m.view.phase === 'gameOver') return; // biten oyunun son durumu: lobide kal
      this.goTable(m.view, m.online);
    } else if (m.t === 'error') {
      sfx.error();
      haptic(30);
      this.setStatus(m.message, true);
      if (m.fatal && !this.lobby) this.showHome();
    } else if (m.t === 'left') {
      this.lobby = null;
      this.showHome();
    }
  }

  private goTable(view: import('@kut/core').GameState, online: boolean[]) {
    const ctrl = new OnlineController(connection, { view, online });
    this.scene.start('table', { mode: view.mode, ruleOrder: view.ruleOrder, online: ctrl });
  }

  private backToMenu() {
    if (this.lobby) {
      this.leaving = true;
      connection.leave();
    }
    this.scene.start('menu');
  }

  private async editName() {
    const v = await promptText({ title: 'Oyuncu adın', value: playerName(), maxLength: 16, okLabel: 'Kaydet' });
    if (!v) return;
    profile().name = v.slice(0, 16);
    saveProfile();
    this.nameT.setText(`${profile().avatar} ${playerName()}`);
  }

  // ---------------------------------------------------------------- görünümler

  // ---------------------------------------------------------------- bağlanıyor penceresi

  private static readonly BUSY_TIMEOUT = 12000;

  /** Küçük "bağlanıyor" penceresi: dönen taş, nokta animasyonu, İptal. Zaman aşımında yardım metni + Tekrar Dene. */
  private showBusy(title: string, retry: () => void) {
    this.hideBusy();
    this.busyRetry = retry;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const c = this.add.container(0, 0).setDepth(5000);
    const dim = this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.55).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    panel(g, cx - 230, cy - 100, 460, 200, 18, UI.panel, 0.97, UI.stroke, 1);
    const tile = this.add.image(cx - 150, cy - 22, 'tile-joker').setScale(0.42);
    this.tweens.add({ targets: tile, angle: 360, duration: 1400, repeat: -1, ease: 'Sine.easeInOut' });
    const t = txt(this, cx - 100, cy - 40, title, 22, UI.goldHex, 900).setOrigin(0, 0.5);
    const sub = txt(this, cx - 100, cy - 6, 'Sunucuya bağlanılıyor', 15, UI.muted, 800).setOrigin(0, 0.5);
    let dots = 0;
    const dotTimer = this.time.addEvent({ delay: 400, loop: true, callback: () => sub.setText('Sunucuya bağlanılıyor' + '.'.repeat((dots = (dots + 1) % 4))) });
    const cancel = new Button(this, cx, cy + 58, 160, 46, 'İptal', () => this.cancelBusy(), UI.slate, 17);
    c.add([dim, g, tile, t, sub, cancel]);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });
    this.busy = c;
    c.once('destroy', () => dotTimer.remove(false));

    this.busyTimer = this.time.delayedCall(LobbyScene.BUSY_TIMEOUT, () => {
      if (!this.busy) return;
      dotTimer.remove(false);
      tile.setVisible(false);
      this.tweens.killTweensOf(tile);
      g.clear();
      panel(g, cx - 300, cy - 150, 600, 300, 18, UI.panel, 0.97, UI.red, 1);
      t.setPosition(cx, cy - 112).setOrigin(0.5).setText('Sunucuya ulaşılamadı').setColor(UI.redHex);
      sub
        .setPosition(cx, cy - 20)
        .setOrigin(0.5)
        .setAlign('center')
        .setWordWrapWidth(540)
        .setLineSpacing(4)
        .setText('İnternet bağlantını kontrol et.\nBazı internet sağlayıcıları oyun sunucusunu engelleyebilir; Wi-Fi ↔ mobil veri değiştirip tekrar dene.');
      cancel.setPosition(cx - 100, cy + 100);
      const again = new Button(this, cx + 100, cy + 100, 180, 50, 'Tekrar Dene', () => {
        const r = this.busyRetry;
        connection.close();
        if (r) {
          this.showBusy(title, r);
          r();
        }
      }, UI.green, 17);
      c.add(again);
      sfx.error();
    });
  }

  private hideBusy() {
    this.busyTimer?.remove(false);
    this.busyTimer = null;
    if (this.busy) {
      const b = this.busy;
      this.busy = null;
      this.tweens.add({ targets: b, alpha: 0, duration: 120, onComplete: () => b.destroy() });
    }
  }

  private cancelBusy() {
    this.hideBusy();
    this.busyRetry = null;
    this.leaving = true;
    connection.close();
    this.leaving = false;
    this.setStatus('');
    if (!this.lobby) this.showHome();
  }

  private clearView() {
    this.view?.destroy();
    this.view = this.add.container(0, 0);
    return this.view;
  }

  private showOffline() {
    const c = this.clearView();
    const g = this.add.graphics();
    panel(g, GAME_W / 2 - 360, 200, 720, 300, 24, UI.panel, 0.95, UI.gold, 0.7);
    c.add(g);
    c.add(txt(this, GAME_W / 2, 236, 'Online sunucu henüz yayında değil', 26, UI.goldHex, 900).setOrigin(0.5, 0));
    c.add(
      txt(
        this,
        GAME_W / 2,
        290,
        'Online oyun için sunucunun bir barındırma servisine kurulması gerekiyor.\nŞimdilik botlarla tekli ya da takım oynayabilirsin.',
        18,
        UI.cream,
        700,
        { align: 'center', lineSpacing: 8 },
      ).setOrigin(0.5, 0),
    );
    c.add(new Button(this, GAME_W / 2, 430, 260, 64, 'Botlarla Oyna', () => this.scene.start('menu'), UI.green, 20));
  }

  private showHome() {
    this.lobby = null;
    const c = this.clearView();
    const y = 330;

    // Oda kur kartı
    const g = this.add.graphics();
    panel(g, 90, 110, 520, 500, 26, UI.panel, 0.92, UI.green, 0.9);
    panel(g, 670, 110, 520, 500, 26, UI.panel, 0.92, UI.blue, 0.9);
    c.add(g);
    c.add(txt(this, 350, 140, 'ODA KUR', 28, '#fff', 900).setOrigin(0.5, 0));
    c.add(txt(this, 350, 184, 'Kodu arkadaşlarına gönder; boş koltuklarda bot oynar.', 15, UI.muted, 800).setOrigin(0.5, 0));
    c.add(txt(this, 140, 236, 'MOD', 13, UI.muted, 900));
    const solo = new Button(this, 270, 284, 210, 52, 'Tekli', () => setMode('solo'), UI.slate, 17);
    const team = new Button(this, 490, 284, 210, 52, "Takım 2'ye 2", () => setMode('team'), UI.slate, 17);
    c.add(txt(this, 140, y + 20, 'KURALLAR', 13, UI.muted, 900));
    const classic = new Button(this, 270, y + 68, 210, 52, 'Sıralı', () => setOrder('classic'), UI.slate, 17);
    const random = new Button(this, 490, y + 68, 210, 52, 'Rastgele', () => setOrder('random'), UI.slate, 17).setIcon(icon('dice'), 24);
    const setMode = (m: GameMode) => {
      this.createMode = m;
      solo.setSelected(m === 'solo', UI.slate);
      team.setSelected(m === 'team', UI.slate);
    };
    const setOrder = (o: RuleOrder) => {
      this.createOrder = o;
      classic.setSelected(o === 'classic', UI.slate);
      random.setSelected(o === 'random', UI.slate);
    };
    setMode(this.createMode);
    setOrder(this.createOrder);
    c.add([solo, team, classic, random]);
    c.add(new Button(this, 350, 540, 300, 72, 'Oda Kur', () => this.createRoom(), UI.green, 22));

    // Katıl kartı
    c.add(txt(this, 930, 140, 'ODAYA KATIL', 28, '#fff', 900).setOrigin(0.5, 0));
    c.add(txt(this, 930, 184, 'Arkadaşının verdiği 4 harfli kodu gir.', 15, UI.muted, 800).setOrigin(0.5, 0));
    ['tile-red-1', 'tile-blue-2', 'tile-yellow-3', 'tile-black-4'].forEach((k, i) =>
      c.add(this.add.image(930 - 117 + i * 78, 330, k).setScale(0.5).setAngle((i - 1.5) * 4)),
    );
    c.add(new Button(this, 930, 540, 300, 72, 'Kodu Gir', () => this.askCode(), UI.blue, 22));
  }

  private createRoom() {
    save('kut-rule-order', this.createOrder);
    save('kut-last-mode', this.createMode);
    this.setStatus('Oda kuruluyor…');
    const go = () => {
      connection.openNew();
      connection.send({ t: 'create', name: playerName(), mode: this.createMode, ruleOrder: this.createOrder, ...look() });
    };
    this.showBusy('Oda kuruluyor…', go);
    go();
  }

  private async askCode() {
    const v = await promptText({ title: 'Oda kodu', placeholder: 'ABCD', maxLength: 4, upper: true, okLabel: 'Katıl' });
    if (!v) return;
    this.join(normalizeCode(v));
  }

  private join(code: string) {
    if (code.length !== 4) {
      this.setStatus('Oda kodu 4 karakter olmalı.', true);
      return;
    }
    this.setStatus(`${code} odasına katılınıyor…`);
    const go = () => {
      connection.openRoom(code);
      connection.send({ t: 'join', code, name: playerName(), ...look() });
    };
    this.showBusy(`${code} odasına giriliyor…`, go);
    go();
  }

  private showRoom(l: LobbyInfo) {
    const c = this.clearView();
    const isHost = l.hostSeat === l.yourSeat;

    // oda kodu
    c.add(txt(this, GAME_W / 2, 92, 'ODA KODU', 14, UI.muted, 900).setOrigin(0.5, 0));
    const codeT = txt(this, GAME_W / 2, 112, l.code.split('').join(' '), 64, UI.goldHex, 900).setOrigin(0.5, 0);
    c.add(codeT);
    const url = `${location.origin}${location.pathname}?oda=${l.code}`;
    c.add(
      new Button(this, GAME_W / 2 + 250, 152, 170, 56, 'Davet Et', async () => {
        const r = await shareLink('Küt: Kural Okey', `Küt odama gel! Kod: ${l.code}`, url);
        showBubble(this, GAME_W / 2 + 250, 108, r === 'copied' ? 'Link kopyalandı' : r === 'shared' ? 'Paylaşıldı' : 'Kod: ' + l.code, UI.gold);
      }, UI.amber, 18),
    );

    // koltuklar (sıra yönü: 1 → 2 → 3 → 4)
    l.seats.forEach((s, i) => {
      const x = 205 + i * 290;
      const y = 330;
      const g = this.add.graphics();
      const you = s.you;
      panel(g, x - 130, y - 92, 260, 184, 22, you ? 0x173f2e : UI.panel, 0.95, you ? UI.gold : s.human ? UI.green : UI.stroke, 1);
      c.add(g);
      const av = this.add.graphics();
      av.fillStyle(s.human ? s.color ?? [0x3b8fe6, 0xd9534f, 0x8e5bd6, 0xe0962a][i] : 0x4a4f57, 1);
      av.fillCircle(x, y - 38, 30);
      c.add(av);
      c.add(txt(this, x, y - 38, s.human ? s.avatar ?? s.name.slice(0, 1).toUpperCase() : '🤖', 26, '#fff', 900).setOrigin(0.5));
      c.add(txt(this, x, y + 8, s.human ? s.name : 'Boş koltuk', 20, s.human ? '#fff' : UI.muted, 900).setOrigin(0.5, 0));
      const tag = s.human ? (s.connected ? (you ? 'Sen' : 'Hazır') : 'Bağlantı koptu') : 'Bot oynar';
      c.add(txt(this, x, y + 40, tag, 14, s.human && !s.connected ? UI.redHex : UI.muted, 800).setOrigin(0.5, 0));
      if (i === l.hostSeat) c.add(txt(this, x, y - 104, '👑 KURUCU', 13, UI.goldHex, 900).setOrigin(0.5, 0.5));
      if (l.mode === 'team') {
        const team = i % 2 === 0 ? 'A' : 'B';
        c.add(txt(this, x, y + 66, `Takım ${team}`, 13, i % 2 === 0 ? '#7cc0ff' : '#ffb27c', 900).setOrigin(0.5, 0));
      }
    });

    const modeText = `${l.mode === 'team' ? "Takım 2'ye 2 (karşılıklı oturanlar ortak)" : 'Tekli'} · ${l.ruleOrder === 'random' ? '🎲 Rastgele kurallar' : 'Sıralı kurallar'}`;
    c.add(txt(this, GAME_W / 2, 446, modeText, 17, UI.cream, 800).setOrigin(0.5, 0));

    if (isHost) {
      const solo = new Button(this, GAME_W / 2 - 330, 512, 150, 46, 'Tekli', () => this.settings('solo', l.ruleOrder), UI.slate, 15);
      const team = new Button(this, GAME_W / 2 - 170, 512, 150, 46, 'Takım', () => this.settings('team', l.ruleOrder), UI.slate, 15);
      const cl = new Button(this, GAME_W / 2 + 170, 512, 150, 46, 'Sıralı', () => this.settings(l.mode, 'classic'), UI.slate, 15);
      const rn = new Button(this, GAME_W / 2 + 330, 512, 150, 46, 'Rastgele', () => this.settings(l.mode, 'random'), UI.slate, 15).setIcon(icon('dice'), 20);
      solo.setSelected(l.mode === 'solo', UI.slate);
      team.setSelected(l.mode === 'team', UI.slate);
      cl.setSelected(l.ruleOrder === 'classic', UI.slate);
      rn.setSelected(l.ruleOrder === 'random', UI.slate);
      c.add([solo, team, cl, rn]);
      const humans = l.seats.filter((s) => s.human).length;
      const start = new Button(this, GAME_W / 2, 600, 340, 76, humans < 4 ? `Başlat (${4 - humans} bot)` : 'Başlat', () => {
        connection.send({ t: 'start' });
        this.setStatus('Oyun başlıyor…');
      }, UI.green, 24);
      c.add(start);
    } else {
      c.add(txt(this, GAME_W / 2, 590, 'Kurucunun oyunu başlatması bekleniyor…', 20, UI.cream, 800).setOrigin(0.5));
    }
    c.add(new Button(this, 110, 600, 170, 56, 'Odadan Çık', () => this.leaveRoom(), UI.red, 16));
    this.setStatus('');
  }

  private settings(mode: GameMode, ruleOrder: RuleOrder) {
    connection.send({ t: 'settings', mode, ruleOrder });
  }

  private leaveRoom() {
    connection.leave();
    this.lobby = null;
    this.showHome();
  }
}
