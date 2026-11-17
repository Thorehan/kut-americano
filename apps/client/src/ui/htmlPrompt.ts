/**
 * Telefon klavyesiyle yazı girmek için küçük HTML penceresi (Phaser'da yerleşik metin kutusu yok).
 * Tuvalin üstünde ortalanır; Tamam/Enter ile değeri, İptal/Esc ile null döner.
 */
export function promptText(opts: {
  title: string;
  value?: string;
  placeholder?: string;
  maxLength?: number;
  upper?: boolean;
  okLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font-family:Nunito,"Segoe UI",Arial,sans-serif';
    const box = document.createElement('form');
    box.style.cssText =
      'background:#0c2c21;border:2px solid #f5c451;border-radius:18px;padding:18px 18px 16px;width:min(360px,86vw);box-shadow:0 10px 30px rgba(0,0,0,.5);color:#f6eeda';
    const h = document.createElement('div');
    h.textContent = opts.title;
    h.style.cssText = 'font-weight:900;font-size:18px;color:#f5c451;margin-bottom:12px;text-align:center';
    const input = document.createElement('input');
    input.value = opts.value ?? '';
    input.placeholder = opts.placeholder ?? '';
    input.maxLength = opts.maxLength ?? 16;
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (opts.upper) {
      input.autocapitalize = 'characters';
      input.style.textTransform = 'uppercase';
      input.style.letterSpacing = '6px';
      input.style.textAlign = 'center';
    }
    input.style.cssText +=
      ';width:100%;box-sizing:border-box;font:800 22px Nunito,Arial,sans-serif;padding:10px 12px;border-radius:12px;border:2px solid #2f6b51;background:#082018;color:#fff;outline:none';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;margin-top:14px';
    const btn = (label: string, primary: boolean) => {
      const b = document.createElement('button');
      b.type = primary ? 'submit' : 'button';
      b.textContent = label;
      b.style.cssText = `flex:1;font:900 17px Nunito,Arial,sans-serif;padding:12px;border-radius:12px;border:0;color:${primary ? '#1b1405' : '#fff'};background:${primary ? '#f5c451' : '#31574a'}`;
      return b;
    };
    const cancel = btn('İptal', false);
    const ok = btn(opts.okLabel ?? 'Tamam', true);
    row.append(cancel, ok);
    box.append(h, input, row);
    wrap.append(box);
    document.body.append(wrap);
    setTimeout(() => input.focus(), 30);

    const done = (v: string | null) => {
      wrap.remove();
      resolve(v);
    };
    box.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      done(v ? (opts.upper ? v.toUpperCase() : v) : null);
    };
    cancel.onclick = () => done(null);
    wrap.onclick = (e) => {
      if (e.target === wrap) done(null);
    };
    input.onkeydown = (e) => {
      if (e.key === 'Escape') done(null);
    };
  });
}

/** Paylaşma: telefonda sistem paylaşım menüsü, değilse panoya kopyalar. */
export async function shareLink(title: string, text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch {
    /* kullanıcı vazgeçti ya da desteklenmiyor */
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
