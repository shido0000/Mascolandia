const CATALOG = {
  "tpl.obediencia": {
    kind: "training",
    icon: "🎓",
    price: "2,99 €",
    credits: 0,
    i18nName: "tplObediencia",
    i18nDesc: "tplObedienciaDesc",
  },
  "tpl.cachorro": {
    kind: "training",
    icon: "🐶",
    price: "3,49 €",
    credits: 0,
    i18nName: "tplCachorro",
    i18nDesc: "tplCachorroDesc",
  },
  "tpl.correa": {
    kind: "training",
    icon: "🦮",
    price: "2,49 €",
    credits: 0,
    i18nName: "tplCorrea",
    i18nDesc: "tplCorreaDesc",
  },
  "pack.indoor": {
    kind: "exercise",
    icon: "🏠",
    price: "1,99 €",
    credits: 0,
    i18nName: "packIndoor",
    i18nDesc: "packIndoorDesc",
  },
  "pack.agility": {
    kind: "exercise",
    icon: "🏃",
    price: "2,99 €",
    credits: 0,
    i18nName: "packAgility",
    i18nDesc: "packAgilityDesc",
  },
  "pack.gato": {
    kind: "exercise",
    icon: "🐱",
    price: "1,99 €",
    credits: 0,
    i18nName: "packGato",
    i18nDesc: "packGatoDesc",
  },
  "cons.pack1": {
    kind: "consult",
    icon: "🩺",
    price: "9,99 €",
    credits: 1,
    i18nName: "consPack1",
    i18nDesc: "consPack1Desc",
  },
  "cons.pack3": {
    kind: "consult",
    icon: "🩺",
    price: "24,99 €",
    credits: 3,
    i18nName: "consPack3",
    i18nDesc: "consPack3Desc",
  },
};

export const SUBSCRIPTION_PLANS = {
  monthly: { price: "4,99 €", period: "perMonth" },
  yearly: { price: "39,99 €", period: "perYear" },
};

export function getCatalog() {
  return CATALOG;
}

export function productById(id) {
  return CATALOG[id] || null;
}

export function isOwned(purchases, id) {
  if (id === "cons.pack1" || id === "cons.pack3") return false;
  return Boolean(purchases[id]);
}

export async function purchase(productId) {
  const product = CATALOG[productId];
  if (!product) return false;
  await new Promise((r) => setTimeout(r, 600));
  return product;
}

export function applyPurchase(state, productId) {
  const product = CATALOG[productId];
  if (!product) return;
  if (product.credits > 0) {
    state.purchases[productId] = (state.purchases[productId] || 0) + product.credits;
  } else {
    state.purchases[productId] = Date.now();
  }
}

export async function restorePurchases() {
  await new Promise((r) => setTimeout(r, 500));
  return true;
}
