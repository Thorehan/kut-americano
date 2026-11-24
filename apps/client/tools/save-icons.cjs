// İkon üreticinin (tools/icons.html?kaydet) çizdiği PNG'leri diske yazan küçük yerel sunucu.
// Kullanım: node apps/client/tools/save-icons.cjs   (sadece localhost'tan, sadece izinli klasörlere yazar)
const http = require('http');
const fs = require('fs');
const path = require('path');

const CLIENT = path.resolve(__dirname, '..');
const ALLOWED = [path.join(CLIENT, 'android', 'app', 'src', 'main', 'res'), path.resolve(CLIENT, '..', '..', 'store')];

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    if (req.method === 'OPTIONS') return res.end();
    if (req.method !== 'POST' || req.url !== '/save') {
      res.statusCode = 404;
      return res.end();
    }
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      try {
        const { path: rel, data } = JSON.parse(body);
        const target = path.resolve(CLIENT, rel);
        if (!ALLOWED.some((a) => target.startsWith(a + path.sep)) || !target.endsWith('.png')) throw new Error('izinsiz yol: ' + rel);
        const m = /^data:image\/png;base64,(.+)$/.exec(data);
        if (!m) throw new Error('png değil');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, Buffer.from(m[1], 'base64'));
        console.log('yazıldı', path.relative(path.resolve(CLIENT, '..', '..'), target));
        res.end('ok');
      } catch (e) {
        res.statusCode = 400;
        res.end(String(e));
      }
    });
  })
  .listen(5199, '127.0.0.1', () => console.log('ikon kaydedici: http://localhost:5199'));
