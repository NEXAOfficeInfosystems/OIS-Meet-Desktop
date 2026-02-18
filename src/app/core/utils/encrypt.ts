import * as CryptoJS from 'crypto-js';

export function encryptValueSixteen(value: string): string {
  const secretKey = 'UnhTR45#@qwerGTD';
  const key = CryptoJS.enc.Utf8.parse(secretKey.padEnd(16).substring(0, 16));
  const iv = CryptoJS.lib.WordArray.random(16);

  const encrypted = CryptoJS.AES.encrypt(value, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  const combined = iv.concat(encrypted.ciphertext);
  const base64 = CryptoJS.enc.Base64.stringify(combined);

  return base64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
