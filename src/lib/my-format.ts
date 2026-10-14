import "server-only";
import { cache } from "react";
import { getCustomer, getTenantById } from "./data";
import { formatterFor, INDIA_FORMAT, regionOf, type Formatter } from "./region-format";
import { getSession } from "./session";

/**
 * Money, weight and dates for whoever is signed in, once per request: a manager sees their business's currency
 * and units, a customer those of the laundry they joined, the owner (and anyone else) India's.
 */
export const myFormat = cache(async (): Promise<Formatter> => {
  const session = await getSession();
  if (session?.role === "MANAGER") return formatterFor(regionOf(await getTenantById(session.tenantId)));
  if (session?.role === "CUSTOMER") {
    const customer = await getCustomer(session.userId);
    return customer?.tenantId ? formatterFor(regionOf(await getTenantById(customer.tenantId))) : INDIA_FORMAT;
  }
  return INDIA_FORMAT;
});
