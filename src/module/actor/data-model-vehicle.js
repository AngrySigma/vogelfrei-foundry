/**
 * @file The data model for Actors of type Vehicle.
 *
 * A vehicle has no legs and no load table of its own. A drawn one -- cart,
 * wagon, coach, sled -- hands its load to its team, less 10 points an axle
 * (Time and Movement.md#mounts); a self-propelled one sails or rows on a speed
 * the Referee gives it, since the book has none yet. Who pulls it and who
 * rides in it is the party roster's business: see party/travel.ts.
 *
 * No ability scores, Stamina, saves or alignment. Structure is there for the
 * day someone shoots the wagon.
 */

import { ANIMAL_ITEMS_PER_POINT } from "../party/travel";
import { encumbranceBreakdown } from "./encumbrance-points";

export default class VogelfreiDataModelVehicle extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

    return {
      propulsion: new StringField({ initial: "drawn", choices: ["drawn", "self"] }),
      medium: new StringField({ initial: "land", choices: ["land", "water"] }),
      axles: new NumberField({ integer: true, min: 0, initial: 2 }),
      milesPerDay: new NumberField({ min: 0, initial: 0 }),
      structure: new SchemaField({
        value: new NumberField({ integer: true, min: 0, initial: 0 }),
        max: new NumberField({ integer: true, min: 0, initial: 0 }),
      }),
      details: new SchemaField({
        biography: new HTMLField({ initial: "" }),
      }),
    };
  }

  prepareDerivedData() {
    // Cargo counts as an animal's load does: a point per 5 items, an oversized
    // thing a point of its own.
    const { itemCount, oversizedPoints } = encumbranceBreakdown([...this.parent.items]);
    this.cargo = {
      items: itemCount,
      points: Math.floor(itemCount / ANIMAL_ITEMS_PER_POINT) + oversizedPoints,
    };
  }

  /** Whether a team pulls it. */
  get isDrawn() {
    return this.propulsion === "drawn";
  }

  /** Nothing about a vehicle is generated, so it is never "new". */
  get isNew() {
    return false;
  }

  /** Cargo at the top level, containers and all, for the sheet. */
  get holds() {
    return this.parent.items.filter((item) => !item.system.containerId).sort((a, b) => a.name.localeCompare(b.name));
  }
}
