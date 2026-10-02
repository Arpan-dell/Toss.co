// Filament colours the Toss box can be printed in. `file` matches the real-photo variants in
// public/brand/basket (generated from the photos of the printed box); `hex` tints the 3D model.
export const BASKET_COLORS = [
  { id: "black", name: "Matte black", hex: "#1d1e22" },
  { id: "white", name: "Arctic white", hex: "#e9ebef" },
  { id: "blue", name: "Toss blue", hex: "#2a5ce6" },
  { id: "teal", name: "Teal", hex: "#16b0a0" },
  { id: "orange", name: "Sunset orange", hex: "#f57620" },
  { id: "red", name: "Signal red", hex: "#d6263a" },
  { id: "green", name: "Leaf green", hex: "#2eaa54" },
] as const;

export type BasketColor = (typeof BASKET_COLORS)[number]["id"];
export const colorOf = (id: BasketColor) => BASKET_COLORS.find((c) => c.id === id) ?? BASKET_COLORS[0];
