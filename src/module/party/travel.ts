/**
 * @file How fast the party travels, and how many watches its day holds,
 *       once some of it rides, drives or sails.
 *
 * Rules: docs/Adventuring/Time and Movement.md#movement and #mounts
 *
 * The roster treats animals and vehicles as containers. A member dropped into
 * one stops moving under its own power -- its load is carried, its legs do not
 * count -- so the party's pace is the slowest *top-level* unit and its day is
 * set by the most burdened one:
 *
 * - a walker, on the character table (0-1 points unencumbered ... 5+ over);
 * - an animal, on the mount table (0-10 ... 26+), carrying its own load, its
 *   riders at 5 points each plus their own load, and its share of anything it
 *   pulls;
 * - a drawn vehicle, which has no legs of its own: its load, less 10 points an
 *   axle, is split across its team, it moves as its slowest animal and its day
 *   is its most burdened one's. A filled Teamster seat takes 5 points off
 *   every animal in the team, and the Teamster rides along as a passenger;
 * - a vessel, which sails on a speed the Referee types in and keeps its own
 *   clock: it has no rest watches, so it never sets the party's day.
 *
 * Foundry-free, so the arithmetic can be checked on its own.
 */

/** Where in a container a member sits. */
export const SEATS = ["aboard", "team", "teamster"] as const;

export type Seat = (typeof SEATS)[number];

/** How a member moves, read off its Actor. */
export type TravellerKind = "walker" | "animal" | "drawn" | "vessel" | "other";

/** What the travel arithmetic needs to know about one member. */
export type Traveller = {
  uuid: string;
  name: string;
  kind: TravellerKind;
  /** The container this member is in, if any. */
  in?: string | null;
  seat?: Seat;
  /**
   * A walker's own encumbrance points on the character table, or an animal's
   * own load on the mount table (gear, barding, mule or pony). Null if the
   * Actor does not count them.
   */
  points?: number | null;
  /** A walker's movement per Turn and miles per day, as its sheet has them. */
  perTurn?: number | null;
  perDay?: number | null;
  /** An animal's unladen movement per Turn, and a mule's half. */
  basePerTurn?: number | null;
  speedFactor?: number;
  /** A drawn vehicle: points of cargo, and axles. */
  cargoPoints?: number;
  axles?: number;
  /** A vessel: miles per day. */
  milesPerDay?: number | null;
};

/** What the arithmetic makes of one member. */
export type Assessment = {
  /** Points on its own table, everything it carries and pulls included. */
  points: number | null;
  perTurn: number | null;
  perDay: number | null;
  /** Watches in the day this member would allow, rest included. */
  watches: number | null;
  /** The Encumbrance band, 0 unencumbered to 4 overencumbered. */
  band: number | null;
};

/** A pace or a day, and every unit at exactly it. */
export type Limit = { value: number; names: string[] };

/** Watches of rest that end every day on land, whatever the load. */
export const REST_WATCHES = 2;

/** A rider, passenger or Teamster: 5 points on top of their own load. */
export const PASSENGER_POINTS = 5;

/** A vehicle's load the team does not feel, per axle. */
export const AXLE_RELIEF = 10;

/** Points a Teamster's packing takes off each animal in the team. */
export const TEAMSTER_RELIEF = 5;

/** Items per point for an animal: "Per 5 items the animal is carrying +1". */
export const ANIMAL_ITEMS_PER_POINT = 5;

/** Barding, worn by an animal: Leather +1, Chain +2, Plate +3. */
export const BARDING_POINTS: Readonly<Record<string, number>> = {
  none: 0,
  leather: 1,
  chain: 2,
  plate: 3,
};

/** The highest points in each band, unencumbered to severely encumbered. */
const WALKER_BANDS = [1, 2, 3, 4] as const;
const ANIMAL_BANDS = [10, 15, 20, 25] as const;

/** Speed in each band, as a share of the unladen speed. */
const BAND_SPEED = [1, 0.75, 0.5, 0.25, 0] as const;

/**
 * Which band some points fall in.
 *
 * @param points - Encumbrance points.
 * @param table - Whose table: a walker's or an animal's.
 * @returns 0 unencumbered, 1 lightly, 2 heavily, 3 severely, 4 overencumbered.
 */
export function band(points: number, table: "walker" | "animal"): number {
  const limits = table === "animal" ? ANIMAL_BANDS : WALKER_BANDS;
  const index = limits.findIndex((max) => points <= max);
  return index === -1 ? limits.length : index;
}

/**
 * Active watches in a day for one band: four for the unencumbered, none for
 * the overencumbered.
 *
 * @param bandIndex - The Encumbrance band.
 * @returns Active watches, four to zero.
 */
export function activeWatches(bandIndex: number): number {
  return Math.max(0, 4 - bandIndex);
}

/**
 * An animal's own load, before riders or anything it pulls.
 *
 * @param itemCount - Ordinary items carried, after stacking.
 * @param oversized - Oversized items, a point each.
 * @param barding - Its barding: none, leather, chain or plate.
 * @param offset - What it starts with: a mule -5, a pony +6.
 * @returns Points on the mount table, never below zero.
 */
export function animalOwnPoints(itemCount: number, oversized = 0, barding = "none", offset = 0): number {
  const items = Math.floor(Math.max(0, itemCount) / ANIMAL_ITEMS_PER_POINT);
  return Math.max(0, items + Math.max(0, oversized) + (BARDING_POINTS[barding] ?? 0) + (Number(offset) || 0));
}

/**
 * Whether a member may sit in a seat of a container.
 *
 * Riders sit on animals, passengers and a Teamster in a drawn vehicle, its
 * team in harness; a vessel carries anything, other vehicles and their teams
 * included.
 *
 * @param container - What is boarded.
 * @param seat - Where.
 * @param passenger - Who.
 * @returns Whether it makes sense.
 */
export function canSit(container: TravellerKind, seat: Seat, passenger: TravellerKind): boolean {
  if (container === "vessel") return seat === "aboard";
  if (container === "animal") return seat === "aboard" && passenger === "walker";
  if (container === "drawn") {
    if (seat === "team") return passenger === "animal";
    return passenger === "walker";
  }
  return false;
}

/**
 * Assess every member, and find the party's pace and day.
 *
 * A member whose container is not on the roster counts as top-level, so a
 * wagon struck off the roster does not strand its passengers.
 *
 * @param travellers - Every member.
 * @returns Each member's figures, and the limits the top-level units set.
 */
export function assess(travellers: Traveller[]): {
  members: Map<string, Assessment>;
  perTurn: Limit | null;
  perDay: Limit | null;
  watches: Limit | null;
} {
  const byUuid = new Map(travellers.map((traveller) => [traveller.uuid, traveller]));
  const container = (traveller: Traveller) =>
    traveller.in && traveller.in !== traveller.uuid ? (byUuid.get(traveller.in) ?? null) : null;
  const inside = (uuid: string, seats: readonly Seat[]) =>
    travellers.filter((traveller) => traveller.in === uuid && seats.includes(traveller.seat ?? "aboard"));

  // A passenger weighs 5 points plus what they carry. Only walkers ride in
  // anything that counts load; a vessel's hold is not weighed.
  const passengerLoad = (uuid: string, seats: readonly Seat[]) =>
    inside(uuid, seats)
      .filter((traveller) => traveller.kind === "walker")
      .reduce((sum, traveller) => sum + PASSENGER_POINTS + Math.max(0, traveller.points ?? 0), 0);

  const drawnLoad = (vehicle: Traveller) =>
    Math.max(
      0,
      (vehicle.cargoPoints ?? 0) +
        passengerLoad(vehicle.uuid, ["aboard", "teamster"]) -
        AXLE_RELIEF * Math.max(0, vehicle.axles ?? 0),
    );

  const members = new Map<string, Assessment>();

  const animal = (traveller: Traveller): Assessment => {
    let points = (traveller.points ?? 0) + passengerLoad(traveller.uuid, ["aboard"]);
    const pulling = container(traveller);
    if (pulling?.kind === "drawn" && traveller.seat === "team") {
      const team = inside(pulling.uuid, ["team"]).filter((member) => member.kind === "animal");
      points += Math.ceil(drawnLoad(pulling) / Math.max(1, team.length));
      if (inside(pulling.uuid, ["teamster"]).length > 0) points -= TEAMSTER_RELIEF;
    }
    points = Math.max(0, points);
    const at = band(points, "animal");
    const base = traveller.basePerTurn;
    const perTurn =
      typeof base === "number" && Number.isFinite(base)
        ? base * (BAND_SPEED[at] ?? 0) * (traveller.speedFactor ?? 1)
        : null;
    return {
      points,
      perTurn,
      perDay: perTurn === null ? null : perTurn / 5,
      watches: activeWatches(at) + REST_WATCHES,
      band: at,
    };
  };

  for (const traveller of travellers) {
    if (traveller.kind === "walker") {
      const points = typeof traveller.points === "number" ? traveller.points : null;
      const at = points === null ? null : band(points, "walker");
      members.set(traveller.uuid, {
        points,
        perTurn: traveller.perTurn ?? null,
        perDay: traveller.perDay ?? null,
        watches: at === null ? null : activeWatches(at) + REST_WATCHES,
        band: at,
      });
    } else if (traveller.kind === "animal") {
      members.set(traveller.uuid, animal(traveller));
    } else if (traveller.kind === "vessel") {
      const miles = traveller.milesPerDay;
      members.set(traveller.uuid, {
        points: null,
        perTurn: null,
        perDay: typeof miles === "number" && Number.isFinite(miles) ? miles : null,
        watches: null,
        band: null,
      });
    } else {
      members.set(traveller.uuid, { points: null, perTurn: null, perDay: null, watches: null, band: null });
    }
  }

  // A drawn vehicle moves as its slowest animal and keeps its most burdened
  // one's day. Without a team it is going nowhere, and says so.
  for (const traveller of travellers) {
    if (traveller.kind !== "drawn") continue;
    const team = inside(traveller.uuid, ["team"])
      .filter((member) => member.kind === "animal")
      .map((member) => members.get(member.uuid) as Assessment);
    const least = (key: "perTurn" | "perDay" | "watches") => {
      const values = team.map((entry) => entry[key]).filter((value): value is number => typeof value === "number");
      return values.length > 0 ? Math.min(...values) : null;
    };
    const hitched = team.length > 0;
    members.set(traveller.uuid, {
      points: drawnLoad(traveller),
      perTurn: hitched ? least("perTurn") : 0,
      perDay: hitched ? least("perDay") : 0,
      watches: hitched ? least("watches") : null,
      band: null,
    });
  }

  const topLevel = travellers.filter((traveller) => !container(traveller) && traveller.kind !== "other");
  const lowest = (key: "perTurn" | "perDay" | "watches"): Limit | null => {
    const counted = topLevel.filter((traveller) => typeof members.get(traveller.uuid)?.[key] === "number");
    if (counted.length === 0) return null;
    const value = Math.min(...counted.map((traveller) => members.get(traveller.uuid)?.[key] as number));
    return {
      value,
      names: counted
        .filter((traveller) => members.get(traveller.uuid)?.[key] === value)
        .map((traveller) => traveller.name),
    };
  };

  return { members, perTurn: lowest("perTurn"), perDay: lowest("perDay"), watches: lowest("watches") };
}
