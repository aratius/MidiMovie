#!/usr/bin/env node
// Gift keys for MidiMovie Pro — signed offline, checked in the browser with the public key. No server, no Lemon Squeezy needed.
//   node tools/license-keys.mjs init                        one time: makes a key pair, prints the PUBLIC key for license-config.js
//   node tools/license-keys.mjs issue "Taro" [--days 365]   prints a key to send to a friend (no --days = never expires)
//   node tools/license-keys.mjs verify <key>                checks a key
// The PRIVATE key stays on your computer (~/.midimovie/gift-private.pem). Never commit it. Whoever has it can mint keys.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = process.env.MIDIMOVIE_KEYDIR || path.join(os.homedir(), '.midimovie');
const privPath = path.join(dir, 'gift-private.pem');
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const [cmd, ...rest] = process.argv.slice(2);

function publicRaw(privateKey) { // uncompressed P-256 point (65 bytes), what WebCrypto imports as "raw"
  const jwk = crypto.createPublicKey(privateKey).export({ format: 'jwk' });
  return Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
}
const loadPriv = () => { if (!fs.existsSync(privPath)) { console.error('No private key yet. Run: node tools/license-keys.mjs init'); process.exit(1); } return crypto.createPrivateKey(fs.readFileSync(privPath)); };

if (cmd === 'init') {
  if (fs.existsSync(privPath)) { console.error('A private key already exists at ' + privPath + '. Not overwriting (old keys would stop working).'); console.log('Its public key:\n' + b64u(publicRaw(loadPriv()))); process.exit(1); }
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log('Private key saved to ' + privPath + '  (back it up somewhere safe, never commit it)\n');
  console.log('Public key — paste into license-config.js as giftPublicKey:\n\n' + b64u(publicRaw(privateKey)) + '\n');
} else if (cmd === 'issue') {
  const name = rest.find(a => !a.startsWith('--')) || 'friend';
  const di = rest.indexOf('--days'), days = di >= 0 ? parseFloat(rest[di + 1]) : 0;
  const id = crypto.randomBytes(3).toString('hex'), now = Math.floor(Date.now() / 1000);
  const payload = b64u(JSON.stringify({ n: name, i: id, t: now, e: days > 0 ? Math.floor(now + days * 86400) : 0 }));
  const body = 'MMF1.' + payload;
  const sig = crypto.sign('sha256', Buffer.from(body), { key: loadPriv(), dsaEncoding: 'ieee-p1363' });
  console.log('Key for ' + name + '  (id ' + id + (days > 0 ? ', expires in ' + days + ' days' : ', no expiry') + '):\n\n' + body + '.' + b64u(sig) + '\n');
  console.log('To switch it off later, add "' + id + '" to `revoked` in license-config.js.');
} else if (cmd === 'verify') {
  const m = /^(MMF1\.[\w-]+)\.([\w-]+)$/.exec((rest[0] || '').trim());
  if (!m) { console.error('Not a gift key'); process.exit(1); }
  const ok = crypto.verify('sha256', Buffer.from(m[1]), { key: crypto.createPublicKey(loadPriv()), dsaEncoding: 'ieee-p1363' }, Buffer.from(m[2], 'base64url'));
  console.log(ok ? 'VALID  ' + Buffer.from(m[1].split('.')[1], 'base64url').toString() : 'INVALID');
  process.exit(ok ? 0 : 1);
} else { console.log('Usage: node tools/license-keys.mjs init | issue "Name" [--days N] | verify <key>'); }
