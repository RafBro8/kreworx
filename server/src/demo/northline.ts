/**
 * Northline Mechanical: the demo business.
 *
 * Everything that appears in the design artboards is scripted here by name,
 * so the seeded product and the designs tell the same story: Tomas on his
 * way to Amara Osei's, the $379 ignitor quote waiting on her, four of eleven
 * jobs done by mid-morning and $4,180 invoiced. The days around it are
 * generated from the templates at the bottom.
 */

import type { LineItem } from "../models/lineItems";
import type { JobStatus } from "../models/Job";

export const COMPANY = {
  name: "Northline Mechanical",
  slug: "northline",
  trade: "Heating & cooling",
  licence: "IL-HVAC-44192",
  timezone: "America/Chicago",
  phone: "(708) 555-0142",
  email: "service@northlinemech.com",
  address: { city: "Mokena", state: "IL" },
};

// .demo is not a real top-level domain, so none of these can reach a person.
const EMAIL_DOMAIN = "northline.kreworx.demo";

export const STAFF = [
  { key: "castillo", name: "Renee Castillo", role: "owner", title: "Owner", startedYear: 2009 },
  { key: "morales", name: "Dana Morales", role: "dispatcher", title: "Dispatcher", startedYear: 2018 },
  { key: "ramirez", name: "Luis Ramirez", role: "technician", title: "Lead technician", startedYear: 2014 },
  { key: "delgado", name: "Tomas Delgado", role: "technician", title: "Lead technician", startedYear: 2017 },
  { key: "novak", name: "Petra Novak", role: "technician", title: "Lead technician", startedYear: 2019 },
  { key: "whitfield", name: "Ben Whitfield", role: "technician", title: "Lead technician", startedYear: 2012 },
  { key: "brooks", name: "Jalen Brooks", role: "technician", title: "Apprentice", startedYear: 2025 },
  { key: "reyes", name: "Sofia Reyes", role: "technician", title: "Service technician", startedYear: 2022 },
] as const;

export type StaffKey = (typeof STAFF)[number]["key"];

export function staffEmail(key: StaffKey): string {
  return `${key}@${EMAIL_DOMAIN}`;
}

export const CREWS = [
  { key: "ramirez", name: "Ramirez", van: "VAN 12", lead: "ramirez", members: ["brooks"] },
  { key: "delgado", name: "Delgado", van: "VAN 08", lead: "delgado", members: [] },
  { key: "novak", name: "Novak", van: "VAN 03", lead: "novak", members: [] },
  { key: "whitfield", name: "Whitfield", van: "VAN 05", lead: "whitfield", members: ["reyes"] },
] as const satisfies readonly { key: string; name: string; van: string; lead: StaffKey; members: readonly StaffKey[] }[];

export type CrewKey = (typeof CREWS)[number]["key"];

// Town centres in the south-west suburbs. Properties are scattered a little
// around these so the map in stage 3 has a believable spread.
const TOWNS = {
  Mokena: { zip: "60448", lat: 41.5261, lng: -87.8892 },
  Frankfort: { zip: "60423", lat: 41.4959, lng: -87.8487 },
  "New Lenox": { zip: "60451", lat: 41.5120, lng: -87.9656 },
  "Tinley Park": { zip: "60477", lat: 41.5731, lng: -87.7845 },
  "Orland Park": { zip: "60462", lat: 41.6303, lng: -87.8539 },
} as const;

export type Town = keyof typeof TOWNS;

export function town(name: Town) {
  return TOWNS[name];
}

type Equipment = { kind: string; make: string; model: string; installedYear: number };

export const CUSTOMERS: readonly {
  key: string;
  name: string;
  kind: "residential" | "commercial";
  street: string;
  town: Town;
  equipment: Equipment[];
  accessNotes?: string;
}[] = [
  { key: "whitaker", name: "Greg Whitaker", kind: "residential", street: "118 Oak St", town: "Mokena", equipment: [{ kind: "Central AC", make: "Carrier", model: "Comfort 13", installedYear: 2011 }] },
  { key: "kalinski", name: "Joanna Kalinski", kind: "residential", street: "2204 Vine Ct", town: "Frankfort", equipment: [{ kind: "Gas furnace", make: "Lennox", model: "ML180", installedYear: 2016 }] },
  { key: "brightway", name: "Brightway Dental", kind: "commercial", street: "900 Ridge Rd", town: "Tinley Park", accessNotes: "Rooftop access through the rear stairwell. Ask the front desk for the key.", equipment: [{ kind: "Rooftop unit", make: "Trane", model: "Voyager 7.5T", installedYear: 2015 }, { kind: "Rooftop unit", make: "Trane", model: "Voyager 5T", installedYear: 2015 }] },
  { key: "osei", name: "Amara Osei", kind: "residential", street: "45 Linden Ave", town: "Mokena", accessNotes: "Side gate code 4471. Dog is friendly.", equipment: [{ kind: "Gas furnace", make: "Goodman", model: "GMVC96", installedYear: 2013 }] },
  { key: "pruitt", name: "Dale Pruitt", kind: "residential", street: "77 Harbor Ln", town: "New Lenox", equipment: [{ kind: "Heat pump", make: "Rheem", model: "Classic RP14", installedYear: 2019 }] },
  { key: "arenas", name: "Marisol Arenas", kind: "residential", street: "31 Sumac Dr", town: "Orland Park", equipment: [{ kind: "Gas furnace", make: "Carrier", model: "Performance 96", installedYear: 2018 }] },
  { key: "devlin", name: "Kathleen Devlin", kind: "residential", street: "12 Bramble Rd", town: "Frankfort", equipment: [{ kind: "Boiler", make: "Weil-McLain", model: "CGa", installedYear: 2008 }] },
  { key: "halvorsen", name: "Erik Halvorsen", kind: "residential", street: "8 Cedar Pt", town: "New Lenox", equipment: [{ kind: "Central AC", make: "Trane", model: "XR14", installedYear: 2012 }] },
  { key: "marchetti", name: "Vince Marchetti", kind: "residential", street: "620 Fairlane Dr", town: "Tinley Park", equipment: [{ kind: "Water heater", make: "A. O. Smith", model: "ProLine 50", installedYear: 2014 }] },
  { key: "lakeside", name: "Lakeside Dental", kind: "commercial", street: "14 Marina Dr", town: "Orland Park", equipment: [{ kind: "Split system", make: "Daikin", model: "DX16", installedYear: 2020 }] },
  { key: "bowen", name: "Claire Bowen", kind: "residential", street: "305 Ember Way", town: "Mokena", equipment: [] },
  { key: "tran", name: "Minh Tran", kind: "residential", street: "56 Aspen Ct", town: "Frankfort", equipment: [{ kind: "Gas furnace", make: "Lennox", model: "EL296", installedYear: 2017 }] },
  { key: "kowalczyk", name: "Adam Kowalczyk", kind: "residential", street: "903 Prairie View Dr", town: "New Lenox", equipment: [{ kind: "Humidifier", make: "Aprilaire", model: "600", installedYear: 2018 }] },
  { key: "feld", name: "Rachel Feld", kind: "residential", street: "22 Wren St", town: "Mokena", equipment: [{ kind: "Central AC", make: "Goodman", model: "GSX14", installedYear: 2010 }] },
  { key: "lindqvist", name: "Nils Lindqvist", kind: "residential", street: "410 Heather Ln", town: "Orland Park", equipment: [{ kind: "Gas furnace", make: "Bryant", model: "Plus 80", installedYear: 2002 }] },
  { key: "okonkwo", name: "Grace Okonkwo", kind: "residential", street: "1180 Timber Trl", town: "Tinley Park", equipment: [{ kind: "Gas furnace", make: "Rheem", model: "R96V", installedYear: 2016 }] },
  { key: "pantry", name: "Village Pantry Market", kind: "commercial", street: "7 Commerce Park Dr", town: "Mokena", accessNotes: "Deliveries only before 8 AM. Walk-in cooler compressor is on the roof.", equipment: [{ kind: "Rooftop unit", make: "Lennox", model: "Energence", installedYear: 2017 }] },
  { key: "castellano", name: "Rita Castellano", kind: "residential", street: "67 Maple Ct", town: "Frankfort", equipment: [{ kind: "Heat pump", make: "Carrier", model: "Infinity 20", installedYear: 2021 }] },
  { key: "hughes", name: "Owen Hughes", kind: "residential", street: "2 Stonegate Ct", town: "New Lenox", equipment: [{ kind: "Gas furnace", make: "Trane", model: "S9V2", installedYear: 2019 }] },
  { key: "cedarrow", name: "Cedar Row Apartments", kind: "commercial", street: "800 Cedar Row", town: "Tinley Park", accessNotes: "Building manager meets the van at the loading dock.", equipment: [{ kind: "Boiler", make: "Lochinvar", model: "Knight XL", installedYear: 2014 }] },
];

export type CustomerKey = string;

const labour = (hours: number, rateDollars = 110): LineItem => ({
  kind: "labour",
  description: "Labour",
  detail: `${hours} ${hours === 1 ? "hour" : "hours"} at $${rateDollars}/h`,
  quantity: hours,
  unitPriceCents: rateDollars * 100,
});

const part = (description: string, dollars: number, quantity = 1, detail?: string): LineItem => ({
  kind: "part",
  description,
  detail,
  quantity,
  unitPriceCents: Math.round(dollars * 100),
});

const fee = (description: string, dollars: number, waived = false, detail?: string): LineItem => ({
  kind: "fee",
  description,
  detail,
  quantity: 1,
  unitPriceCents: Math.round(dollars * 100),
  waived,
});

/** HH:MM to minutes after midnight, so the script below reads like a schedule. */
export const at = (clock: string): number => {
  const [hours, minutes] = clock.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
};

type ScriptedEvent = { status: JobStatus; at: string };

export type ScriptedJob = {
  number: number;
  customer: string;
  crew: CrewKey;
  title: string;
  description?: string;
  priority?: "normal" | "high" | "urgent";
  start: string;
  end: string;
  status: JobStatus;
  events: ScriptedEvent[];
  invoice?: { lineItems: LineItem[]; paid: boolean };
};

/** Today, as it stands at about twenty past ten in the morning. */
export const TODAY: ScriptedJob[] = [
  {
    number: 4466, customer: "whitaker", crew: "ramirez", title: "AC not cooling", start: "7:00", end: "9:00", status: "done",
    description: "Run capacitor failed. Replaced it and topped up refrigerant.",
    events: [{ status: "en_route", at: "6:42" }, { status: "on_site", at: "7:03" }, { status: "done", at: "8:52" }],
    invoice: { paid: false, lineItems: [fee("Service call", 189), part("Run capacitor", 68, 1, "45/5 MFD dual"), part("R-410A refrigerant", 45, 3, "Per pound"), labour(2)] },
  },
  {
    number: 4467, customer: "brightway", crew: "delgado", title: "Rooftop unit inspection", start: "7:00", end: "10:00", status: "done",
    description: "Seasonal inspection of both rooftop units ahead of heating season.",
    events: [{ status: "en_route", at: "6:35" }, { status: "on_site", at: "6:58" }, { status: "done", at: "9:51" }],
    invoice: { paid: false, lineItems: [fee("Commercial rooftop inspection", 450, false, "Per unit"), fee("Commercial rooftop inspection", 450, false, "Per unit"), part("Drive belt", 64, 2), fee("Condenser coil cleaning", 356, false, "Per unit"), fee("Condenser coil cleaning", 356, false, "Per unit"), part("Economizer actuator", 480), labour(3, 140)] },
  },
  {
    number: 4468, customer: "devlin", crew: "whitfield", title: "Maintenance plan visit", start: "7:30", end: "9:30", status: "done",
    description: "Annual boiler service under the Comfort Plan.",
    events: [{ status: "en_route", at: "7:08" }, { status: "on_site", at: "7:31" }, { status: "done", at: "9:24" }],
    invoice: { paid: true, lineItems: [fee("Comfort Plan renewal", 199, false, "12 months"), part("Flame sensor", 48), labour(2, 96)] },
  },
  {
    number: 4469, customer: "arenas", crew: "novak", title: "Duct cleaning", start: "8:00", end: "10:00", status: "done",
    events: [{ status: "en_route", at: "7:40" }, { status: "on_site", at: "8:01" }, { status: "done", at: "9:57" }],
    invoice: { paid: true, lineItems: [fee("Whole-home duct cleaning", 399), fee("Dryer vent cleaning", 90)] },
  },
  {
    number: 4470, customer: "kalinski", crew: "ramirez", title: "Furnace tune-up + filter", start: "9:30", end: "12:30", status: "on_site",
    events: [{ status: "en_route", at: "9:08" }, { status: "on_site", at: "9:34" }],
  },
  {
    number: 4471, customer: "osei", crew: "delgado", title: "No heat - priority", start: "10:30", end: "12:30", status: "en_route", priority: "high",
    description: "Repair visit following yesterday's diagnosis: replace the cracked hot-surface ignitor once the quote is approved.",
    events: [{ status: "en_route", at: "10:08" }],
  },
  { number: 4472, customer: "kowalczyk", crew: "novak", title: "Humidifier service", start: "11:00", end: "12:30", status: "scheduled", events: [] },
  {
    number: 4473, customer: "halvorsen", crew: "whitfield", title: "Compressor replacement", start: "11:30", end: "15:00", status: "parts_on_order",
    description: "Scroll compressor on back-order from the supplier; expected on the afternoon truck.",
    events: [{ status: "parts_on_order", at: "8:15" }],
  },
  { number: 4474, customer: "pruitt", crew: "delgado", title: "Thermostat swap", start: "13:00", end: "14:30", status: "scheduled", events: [] },
  { number: 4475, customer: "tran", crew: "ramirez", title: "Mini-split install", start: "13:30", end: "16:00", status: "scheduled", events: [] },
  { number: 4476, customer: "feld", crew: "novak", title: "No cooling", start: "14:00", end: "16:00", status: "scheduled", events: [] },
];

export const BACKLOG = [
  { number: 4477, customer: "marchetti", title: "Water heater leak", priority: "urgent" as const, minutes: 120, note: "Called 8:42 AM", requestedAt: "8:42" },
  { number: 4478, customer: "lakeside", title: "Quarterly filter change", priority: "normal" as const, minutes: 60, note: "Due this week", requestedAt: "7:15" },
  { number: 4479, customer: "bowen", title: "Estimate - new install", priority: "normal" as const, minutes: 45, note: "Customer flexible", requestedAt: "9:20" },
];

/** Quotes, keyed to the job they belong to. Past estimate visits are scripted in `buildDemo`. */
export const OSEI_QUOTE = {
  findings:
    "The hot-surface ignitor has a hairline crack, so the furnace tries to light, fails, and locks out after three attempts. Everything else - the gas valve, flame sensor and blower - tested normal. Replacing the ignitor should restore heat today.",
  lineItems: [
    part("Hot-surface ignitor", 214, 1, "OEM part · 1-year warranty"),
    { ...labour(1.5), description: "Labour - replacement and test" },
    fee("Diagnostic visit", 89, true, "Waived when the repair is approved"),
  ] satisfies LineItem[],
};

export const HALVORSEN_QUOTE = {
  findings: "The compressor has an internal short and will not start. The coil and lineset pressure-test fine, so a compressor swap is the economical repair.",
  lineItems: [part("Scroll compressor", 2480, 1, "3-ton · 5-year parts warranty"), part("R-410A refrigerant", 45, 8, "Per pound"), labour(6), fee("Disposal and permit", 360)] satisfies LineItem[],
};

export const PRUITT_QUOTE = {
  findings: "The existing thermostat cannot run the heat pump's second stage, which is why the backup heat strips come on so often.",
  lineItems: [part("Smart thermostat", 289, 1, "Two-stage heat pump compatible"), part("Wiring adapter", 38), labour(1)] satisfies LineItem[],
};

export const TRAN_QUOTE = {
  findings: "A single-zone ductless unit will cool and heat the converted garage without extending the ductwork.",
  lineItems: [part("Ductless mini-split", 2150, 1, "12,000 BTU · 22 SEER"), part("Lineset and mounting kit", 240), labour(4.5)] satisfies LineItem[],
};

export const LINDQVIST_QUOTE = {
  findings: "The furnace is 24 years old with a rusted heat exchanger. Repairs are no longer good value; we recommend replacement before winter.",
  lineItems: [part("96% AFUE gas furnace", 4850, 1, "80,000 BTU · 10-year parts warranty"), part("Venting and condensate kit", 420), labour(12, 110), fee("Permit", 360)] satisfies LineItem[],
};

export const OKONKWO_QUOTE = {
  findings: "Indoor humidity is at 22%. A bypass humidifier on the existing furnace will bring it to a comfortable 35-40%.",
  lineItems: [part("Bypass humidifier", 520, 1, "Includes water panel and humidistat"), part("Water line and drain kit", 90), labour(3, 110), fee("First-season check", 0)] satisfies LineItem[],
};

/** Everyday work used to fill the days around the scripted one. */
export const TEMPLATES: readonly { title: string; minutes: number; lineItems: LineItem[] }[] = [
  { title: "Furnace tune-up", minutes: 90, lineItems: [fee("Heating tune-up", 129), part("Pleated filter", 24, 1, "16x25x1 MERV 11")] },
  { title: "AC tune-up", minutes: 90, lineItems: [fee("Cooling tune-up", 129), part("Coil cleaner", 18)] },
  { title: "No heat", minutes: 120, lineItems: [fee("Diagnostic visit", 89), part("Flame sensor", 48), labour(1)] },
  { title: "Thermostat replacement", minutes: 60, lineItems: [part("Programmable thermostat", 139), labour(1)] },
  { title: "Blower motor replacement", minutes: 180, lineItems: [part("Blower motor", 385, 1, "1/2 HP variable speed"), labour(2.5)] },
  { title: "Refrigerant leak check", minutes: 120, lineItems: [fee("Electronic leak search", 189), part("R-410A refrigerant", 45, 2, "Per pound")] },
  { title: "Condensate pump replacement", minutes: 60, lineItems: [part("Condensate pump", 96), labour(1)] },
  { title: "Water heater flush", minutes: 60, lineItems: [fee("Water heater flush and inspection", 149)] },
  { title: "Maintenance plan visit", minutes: 120, lineItems: [fee("Comfort Plan visit", 0, false, "Covered by plan"), part("Pleated filter", 24), labour(1, 96)] },
  { title: "Boiler service", minutes: 150, lineItems: [fee("Boiler service", 219), part("Pressure relief valve", 58)] },
];

/**
 * What the technician wrote up before quoting, for the work behind us.
 *
 * The scripted quotes above each have their own diagnosis because a visitor
 * reads those. These are for the months of history nobody opens one by one,
 * and exist so a quote pulled up at random still reads like a person wrote it.
 */
export const HISTORY_FINDINGS: readonly string[] = [
  "Unit is running but well down on capacity. Parts and labour to put it right are listed below.",
  "Found the fault on the first visit and quoted the repair rather than guessing at a price on the doorstep.",
  "The failed part is still available for this model, so a repair makes better sense than a replacement.",
  "Everything else tested within range. The work below is what it needs and nothing more.",
  "Wear consistent with the age of the equipment. Quoted the repair, with the alternative noted on the call.",
  "Traced it to a single component rather than a system fault, which keeps the cost where it is below.",
];
