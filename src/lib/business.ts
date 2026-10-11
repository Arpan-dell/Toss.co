// Who runs Toss, in one place: shown in the footer, on Contact, and in the Privacy, Refund, Cookie and Terms
// pages. Only filled-in fields are shown. Fill in the blanks (legal name, registered address, phone, GSTIN) as
// soon as they exist; never put a placeholder here, since these are published as facts about the business.

export const BUSINESS = {
  brand: "Toss Smart Laundry",
  legalName: "", // e.g. the registered company or proprietor's name
  address: "", // registered business address
  city: "New Delhi, India",
  email: "toss.smartlaundry@gmail.com",
  phone: "", // customer support number
  gstin: "", // GST number, once registered
  // Grievance contact under India's IT Rules and the DPDP Act: who handles privacy and data complaints
  grievance: { name: "", email: "toss.smartlaundry@gmail.com", replyDays: 30 },
} as const;

/** The details that are filled in, as label/value pairs, in display order. */
export function businessDetails(): [string, string][] {
  const b = BUSINESS;
  return (
    [
      ["Business", b.legalName || b.brand],
      ["Address", b.address],
      ["City", b.address ? "" : b.city],
      ["Email", b.email],
      ["Phone", b.phone],
      ["GSTIN", b.gstin],
    ] as [string, string][]
  ).filter(([, v]) => v);
}
