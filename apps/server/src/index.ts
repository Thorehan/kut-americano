import { startServer } from './server';

const port = Number(process.env.PORT ?? 2567);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

startServer({ port, allowedOrigins }).then((s) => {
  console.log(`Küt sunucusu çalışıyor: ws://localhost:${s.port}${allowedOrigins.length ? ` · izinli kökenler: ${allowedOrigins.join(', ')}` : ''}`);
});
