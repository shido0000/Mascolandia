import { Preferences } from "@capacitor/preferences";

const KEY_NAME = "mascolandia_paykey";
const DATA_NAME = "mascolandia_paydata";

const enc = new TextEncoder();
const dec = new TextDecoder();

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getKey() {
  const { value } = await Preferences.get({ key: KEY_NAME });
  if (value) {
    return crypto.subtle.importKey("raw", b64ToBuf(value), "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  await Preferences.set({ key: KEY_NAME, value: bufToB64(raw) });
  return key;
}

export async function saveCard(data) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
  await Preferences.set({ key: DATA_NAME, value: JSON.stringify({ iv: bufToB64(iv), ct: bufToB64(ct) }) });
}

export async function getCard() {
  try {
    const { value } = await Preferences.get({ key: DATA_NAME });
    if (!value) return null;
    const { iv, ct } = JSON.parse(value);
    const key = await getKey();
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(iv) }, key, b64ToBuf(ct));
    return JSON.parse(dec.decode(plain));
  } catch {
    return null;
  }
}

export async function hasCard() {
  return (await getCard()) !== null;
}

export async function deleteCard() {
  await Preferences.remove({ key: DATA_NAME });
}

export function maskCard(number) {
  const clean = String(number).replace(/\s/g, "");
  return "•••• •••• " + clean.slice(-4);
}
