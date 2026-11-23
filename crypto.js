// Cifrado de extremo a extremo: PBKDF2 (SHA-256) -> AES-GCM 256.
// La contraseña nunca sale del dispositivo; solo se sube texto cifrado.
import { SyncError } from './errors.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

export const ITERATIONS = 310000;

export function b64encode(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

export function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8ToB64(text) {
  return b64encode(enc.encode(text));
}

export function b64ToUtf8(b64) {
  return dec.decode(b64decode(b64));
}

export function newSalt() {
  return b64encode(crypto.getRandomValues(new Uint8Array(16)));
}

// La clave derivada es "no extraíble": se puede guardar en IndexedDB
// para no pedir la contraseña cada vez, pero no se puede leer como texto.
export async function deriveKey(passphrase, saltB64, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64decode(saltB64), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson(key, saltB64, iterations, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)))
  );
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: iterations, salt: saltB64, iv: b64encode(iv), data: b64encode(ct) };
}

export async function decryptJson(key, file) {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(file.iv) }, key, b64decode(file.data));
    return JSON.parse(dec.decode(pt));
  } catch (e) {
    throw new SyncError('WRONG_KEY', 'Contraseña incorrecta (o el archivo está dañado).');
  }
}
