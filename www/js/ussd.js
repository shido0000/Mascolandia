import { Capacitor, registerPlugin } from "@capacitor/core";
import { getCard } from "./crypto.js";

const Ussd = registerPlugin("Ussd");

export const DESTINATION_CARD = "9225129876543210";

export const USSD_CODES = {
  authBanmet: "*444*40*03#",
  authBandec: "444*4002#",
  balance: "*444*46#",
  transfer: "*444*45#",
};

export const TRANSFER_TEMPLATE = "*444*45*{dest}*{amount}#";

export function buildTransferCode(dest, amount) {
  return TRANSFER_TEMPLATE.replace("{dest}", dest).replace("{amount}", amount);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function dialUssd(code) {
  if (!Capacitor.isNativePlatform()) {
    await sleep(600);
    return { dialed: true, simulated: true };
  }
  return Ussd.send({ code });
}

export async function pay(amountCup) {
  const card = await getCard();
  if (!card) return { ok: false, reason: "no-card" };
  try {
    const authCode = card.bank === "bandec" ? USSD_CODES.authBandec : USSD_CODES.authBanmet;
    await dialUssd(authCode);
    await sleep(2500);
    await dialUssd(buildTransferCode(DESTINATION_CARD, amountCup));
    await sleep(1500);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}
