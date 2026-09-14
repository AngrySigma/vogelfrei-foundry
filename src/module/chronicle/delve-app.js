/**
 * @file One delve's window: the Turn clock and everything it burns.
 *
 * The turn track is the dungeon's own clock and touches nothing above ground.
 * When the party comes back up, `syncWatches` moves the calendar by however
 * many watches the Referee decides the trip cost -- the number in the box is a
 * suggestion from the Turn count and is meant to be overwritten.
 *
 * The player's copy of this window is a readout. What it leaves out is the
 * wandering monster rule and the XP running total: knowing the check is two in
 * six tells a party exactly how frightened to be, and the book has the Referee
 * roll it in secret (docs/Adventuring/Dungeon Exploration.md).
 */
import { formatMoney, parseMoney } from "../money";
import {
  adjustLight,
  advanceTurns,
  checksBetween,
  DUNGEON_DISTANCE,
  encounterDue,
  killXP,
  LIGHT_KINDS,
  lightRemaining,
  lightSource,
  lootXP,
  rest,
  restState,
  setTurn,
  suggestedWatches,
  TURNS_BEFORE_REST,
  TURNS_PER_HOUR,
  xpForHitDice,
} from "./chronicle";
import { advanceWatches } from "./day";
import { rollEncounterChecks } from "./encounter";
import { getChronicle, getDelve, refreshOnChange, updateChronicle, updateDelve } from "./store";
import announceUpkeep from "./upkeep";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Read a number out of one of the window's inputs.
 *
 * @param {HTMLElement} root - The window element.
 * @param {string} name - The input's name.
 * @param {number} fallback - What to use when the box is empty or nonsense.
 * @returns {number} The value.
 */
function numberFrom(root, name, fallback = 0) {
  const raw = Number(root.querySelector(`[name="${name}"]`)?.value);
  return Number.isFinite(raw) ? raw : fallback;
}

/**
 * How the delve describes itself on a whispered check.
 *
 * @param {import("./chronicle").Delve} delve - The delve being checked.
 * @returns {object} Arguments for rollEncounterCheck.
 */
function checkFor(delve) {
  return {
    speaker: delve.name,
    where: game.i18n.format("VF.chronicle.AtTurn", { turn: delve.turn }),
    chanceIn6: delve.encounter.chanceIn6,
    distance: delve.encounter.distance || DUNGEON_DISTANCE,
  };
}

/**
 * Spend Turns, and make every random encounter check that falls due.
 *
 * @param {string} delveId - The delve.
 * @param {number} turns - How many Turns to spend.
 */
async function spendTurns(delveId, turns) {
  const before = getDelve(delveId);
  if (!before) return;

  await updateDelve(delveId, (delve) => advanceTurns(delve, turns));

  const after = getDelve(delveId);
  if (!after) return;

  // An hour is six Turns and may cross several checks. Count them rather than
  // asking only whether we landed on one.
  const due = checksBetween(before.turn, after.turn, after.encounter.everyTurns);
  await rollEncounterChecks(due, checkFor(after));
}

/** @this {DelveApp} */
async function onTurnForward() {
  await spendTurns(this.delveId, 1);
}

/** @this {DelveApp} */
async function onHourForward() {
  await spendTurns(this.delveId, TURNS_PER_HOUR);
}

/**
 * Take back a Turn. Nothing is rolled: undoing is not living through it again.
 *
 * @this {DelveApp}
 */
async function onTurnBack() {
  await updateDelve(this.delveId, (delve) => setTurn(delve, delve.turn - 1));
}

/**
 * Put the Turn count on whatever was typed. A correction, so nothing is rolled.
 *
 * @this {DelveApp}
 * @param {Event} event - The change.
 */
async function onSetTurn(event) {
  const turn = Number(event.target.value);
  await updateDelve(this.delveId, (delve) => setTurn(delve, turn));
}

/** @this {DelveApp} */
async function onRest() {
  await updateDelve(this.delveId, rest);
}

/** @this {DelveApp} */
async function onRollEncounter() {
  const delve = getDelve(this.delveId);
  if (delve) await rollEncounterChecks(1, checkFor(delve));
}

/**
 * Save the wandering monster cadence and chance from their boxes.
 *
 * @this {DelveApp}
 */
async function onSaveEncounterRule() {
  const everyTurns = Math.max(1, Math.trunc(numberFrom(this.element, "everyTurns", 2)));
  const chanceIn6 = Math.max(0, Math.min(6, Math.trunc(numberFrom(this.element, "chanceIn6", 1))));
  const distance = this.element.querySelector('[name="distance"]')?.value?.trim() || DUNGEON_DISTANCE;

  if (!Roll.validate(distance)) {
    ui.notifications?.warn(game.i18n.format("VF.chronicle.BadFormula", { formula: distance }));
    this.render();
    return;
  }

  await updateDelve(this.delveId, (delve) => ({ ...delve, encounter: { everyTurns, chanceIn6, distance } }));
}

/**
 * Light something, burning from this Turn.
 *
 * @this {DelveApp}
 */
async function onLight() {
  const kind = this.element.querySelector('[name="lightKind"]')?.value || "torch";
  const nameField = this.element.querySelector('[name="lightName"]');
  const name = nameField?.value?.trim();

  // An eternal source burns for null; anything else takes whatever is in the
  // box, which starts at the book's duration and is there to be overwritten
  // for the flask that was already half used.
  const raw = this.element.querySelector('[name="lightTurns"]')?.value;
  const typed = Number(raw);
  const turns = kind === "eternal" ? null : Math.max(0, Number.isFinite(typed) ? Math.trunc(typed) : 0);

  await updateDelve(this.delveId, (delve) => ({
    ...delve,
    lights: [...delve.lights, lightSource(name || "", kind, delve.turn, foundry.utils.randomID(), turns)],
  }));

  if (nameField) nameField.value = "";
}

/**
 * Top a burning source up, or take fuel out of it.
 *
 * @this {DelveApp}
 * @param {PointerEvent} _event - The click.
 * @param {HTMLElement} target - The button clicked, carrying the amount.
 */
async function onFeedLight(_event, target) {
  const { lightId } = target.closest("[data-light-id]")?.dataset ?? {};
  const turns = Number(target.dataset.turns);
  if (!lightId || !Number.isFinite(turns)) return;

  await updateDelve(this.delveId, (delve) => ({
    ...delve,
    lights: delve.lights.map((light) => (light.id === lightId ? adjustLight(light, turns) : light)),
  }));
}

/**
 * Put a light out, or clear a burnt-out one off the list.
 *
 * @this {DelveApp}
 * @param {PointerEvent} _event - The click.
 * @param {HTMLElement} target - The button clicked.
 */
async function onDouse(_event, target) {
  const { lightId } = target.closest("[data-light-id]")?.dataset ?? {};
  if (!lightId) return;
  await updateDelve(this.delveId, (delve) => ({
    ...delve,
    lights: delve.lights.filter((light) => light.id !== lightId),
  }));
}

/**
 * Record a defeated enemy. XP comes from its Hit Dice, not from a typed number.
 *
 * @this {DelveApp}
 */
async function onAddKill() {
  const field = this.element.querySelector('[name="killName"]');
  const name = field?.value?.trim();
  if (!name) {
    ui.notifications?.warn(game.i18n.localize("VF.chronicle.NameTheEnemy"));
    return;
  }
  const hitDice = Math.max(0, numberFrom(this.element, "killHitDice", 1));
  const count = Math.max(1, Math.trunc(numberFrom(this.element, "killCount", 1)));
  const special = Boolean(this.element.querySelector('[name="killSpecial"]')?.checked);

  await updateDelve(this.delveId, (delve) => ({
    ...delve,
    kills: [...delve.kills, { id: foundry.utils.randomID(), name, hitDice, special, count }],
  }));

  if (field) field.value = "";
}

/** @this {DelveApp} */
async function onRemoveKill(_event, target) {
  const { killId } = target.closest("[data-kill-id]")?.dataset ?? {};
  if (!killId) return;
  await updateDelve(this.delveId, (delve) => ({
    ...delve,
    kills: delve.kills.filter((kill) => kill.id !== killId),
  }));
}

/**
 * Record recovered treasure, priced the way the book prices anything.
 *
 * @this {DelveApp}
 */
async function onAddLoot() {
  const nameField = this.element.querySelector('[name="lootName"]');
  const valueField = this.element.querySelector('[name="lootValue"]');
  const name = nameField?.value?.trim();
  const raw = valueField?.value ?? "";
  if (!name) {
    ui.notifications?.warn(game.i18n.localize("VF.chronicle.NameTheTreasure"));
    return;
  }

  const { bp } = parseMoney(raw);
  if (bp === null) {
    ui.notifications?.warn(game.i18n.format("VF.items.CostUnreadable", { value: raw }));
    return;
  }

  await updateDelve(this.delveId, (delve) => ({
    ...delve,
    loot: [...delve.loot, { id: foundry.utils.randomID(), name, bp }],
  }));

  if (nameField) nameField.value = "";
  if (valueField) valueField.value = "";
}

/** @this {DelveApp} */
async function onRemoveLoot(_event, target) {
  const { lootId } = target.closest("[data-loot-id]")?.dataset ?? {};
  if (!lootId) return;
  await updateDelve(this.delveId, (delve) => ({
    ...delve,
    loot: delve.loot.filter((entry) => entry.id !== lootId),
  }));
}

/**
 * Move the surface on by the watches this delve cost.
 *
 * @this {DelveApp}
 */
async function onSyncWatches() {
  const watches = Math.trunc(numberFrom(this.element, "watches", 0));
  if (!watches) return;

  const delve = getDelve(this.delveId);
  if (!delve) return;

  const before = getChronicle();
  await updateChronicle((chronicle) => ({
    ...chronicle,
    ...advanceWatches(chronicle, watches, chronicle.watchesPerDay),
    delves: chronicle.delves.map((entry) => (entry.id === delve.id ? { ...entry, turnAtLastSync: entry.turn } : entry)),
  }));

  // No travel checks for time spent underground -- the delve made its own --
  // but a day that ended down there still ate its rations.
  await announceUpkeep(getChronicle().day - before.day);
}

export default class DelveApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "vf-delve-{id}",
    classes: ["vogelfrei", "vf-delve"],
    window: {
      title: "VF.chronicle.DelveTitle",
      icon: "fa-solid fa-dungeon",
      resizable: true,
    },
    position: { width: 380, height: "auto" },
    actions: {
      turnForward: onTurnForward,
      turnBack: onTurnBack,
      hourForward: onHourForward,
      rest: onRest,
      rollEncounter: onRollEncounter,
      light: onLight,
      feedLight: onFeedLight,
      douse: onDouse,
      addKill: onAddKill,
      removeKill: onRemoveKill,
      addLoot: onAddLoot,
      removeLoot: onRemoveLoot,
      syncWatches: onSyncWatches,
    },
  };

  static PARTS = {
    main: { template: "/systems/vogelfrei/dist/templates/apps/delve.hbs" },
  };

  /** Which delve this window is a view of. */
  get delveId() {
    return this.options.delveId;
  }

  /**
   * Open a delve's window, or bring the open one forward.
   *
   * Windows are views; the record is the delve in the Chronicle. Two windows
   * onto the same delve would only disagree with each other.
   *
   * @param {string} delveId - The delve to show.
   * @returns {DelveApp} The window showing it.
   */
  static open(delveId) {
    for (const app of DelveApp.instances()) {
      if (app.delveId === delveId) {
        app.bringToFront();
        return app;
      }
    }
    return new DelveApp({ delveId }).render(true);
  }

  /** @inheritDoc */
  _initializeApplicationOptions(options) {
    const initialized = super._initializeApplicationOptions(options);
    // One window per delve, so the window id is the delve id.
    initialized.uniqueId = options.delveId ?? initialized.uniqueId;
    return initialized;
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    // The wandering monster rule saves on change rather than on a click:
    // a number spinner has no button to hang an action off.
    this.element.querySelector('[name="turn"]')?.addEventListener("change", onSetTurn.bind(this));
    for (const input of this.element.querySelectorAll('[name="everyTurns"], [name="chanceIn6"], [name="distance"]')) {
      input.addEventListener("change", onSaveEncounterRule.bind(this));
    }

    // Picking a kind fills in its book duration, which is then editable: the
    // flask someone already burned half of is the reason the box exists.
    const kinds = this.element.querySelector('[name="lightKind"]');
    const turns = this.element.querySelector('[name="lightTurns"]');
    kinds?.addEventListener("change", () => {
      const chosen = kinds.selectedOptions[0]?.dataset ?? {};
      const eternal = chosen.eternal === "true";
      if (!turns) return;
      turns.disabled = eternal;
      turns.value = eternal ? "" : (chosen.turns ?? "");
    });
  }

  /** @inheritDoc */
  get title() {
    return getDelve(this.delveId)?.name ?? game.i18n.localize("VF.chronicle.DelveTitle");
  }

  /** @inheritDoc */
  async _prepareContext() {
    const delve = getDelve(this.delveId);
    if (!delve) return { missing: true };

    const isReferee = game.user.isGM;
    const state = restState(delve);

    return {
      missing: false,
      isReferee,
      delve,
      rest: {
        ...state,
        since: delve.turnsSinceRest,
        allowed: TURNS_BEFORE_REST,
      },
      lights: delve.lights.map((light) => {
        const remaining = lightRemaining(light, delve.turn);
        const eternal = light.turns === null;
        const kindLabel = game.i18n.localize(`VF.chronicle.light.${light.kind}`);
        return {
          ...light,
          kindLabel,
          // Older lights stored the kind as their name when nobody carried them.
          carrier: [light.kind, kindLabel].includes(light.name) ? "" : light.name,
          eternal,
          remaining: eternal ? null : Math.max(0, remaining),
          out: !eternal && remaining <= 0,
          guttering: !eternal && remaining > 0 && remaining <= 2,
          percent: eternal ? 100 : Math.max(0, Math.min(100, Math.round((remaining / (light.turns || 1)) * 100))),
        };
      }),
      lightKinds: Object.entries(LIGHT_KINDS).map(([kind, { turns, radius }]) => ({
        kind,
        label: `VF.chronicle.light.${kind}`,
        turns,
        radius,
        eternal: turns === null,
      })),
      defaultLightTurns: LIGHT_KINDS.torch?.turns ?? 6,
      kills: delve.kills.map((kill) => ({
        ...kill,
        xp: xpForHitDice(kill.hitDice, kill.special) * kill.count,
      })),
      loot: delve.loot.map((entry) => ({ ...entry, price: formatMoney(entry.bp) })),
      // The Referee's half: the wandering monster rule and the running score.
      encounter: isReferee
        ? {
            ...delve.encounter,
            distance: delve.encounter.distance || DUNGEON_DISTANCE,
            due: encounterDue(delve),
          }
        : null,
      xp: isReferee ? { kills: killXP(delve), loot: lootXP(delve) } : null,
      suggested: suggestedWatches(delve, getChronicle().watchesPerDay),
    };
  }
}

refreshOnChange(DelveApp);
