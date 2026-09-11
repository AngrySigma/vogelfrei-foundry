/**
 * @file The Chronicle window: what day it is, and what the party is down.
 *
 * Always available, never modal. The calendar at the top is the whole of the
 * watch track; the list below it is every delve the world remembers, open or
 * not. Closing a delve's window closes nothing -- the record is here until the
 * Referee drops it.
 */
import { advanceDays, advanceWatches, clockOf, newDelve, restState, watchOf } from "./chronicle";
import DelveApp from "./delve-app";
import { getChronicle, refreshOnChange, updateChronicle } from "./store";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Move the calendar on by one watch.
 *
 * @this {ChronicleApp}
 */
async function onWatchForward() {
  await updateChronicle((chronicle) => ({ ...chronicle, ...advanceWatches(chronicle, 1) }));
}

/**
 * Take back a watch, for the click that should not have happened.
 *
 * @this {ChronicleApp}
 */
async function onWatchBack() {
  await updateChronicle((chronicle) => ({ ...chronicle, ...advanceWatches(chronicle, -1) }));
}

/**
 * Skip a whole day, keeping the time of day.
 *
 * @this {ChronicleApp}
 */
async function onDayForward() {
  await updateChronicle((chronicle) => ({ ...chronicle, ...advanceDays(chronicle, 1) }));
}

/**
 * Start a delve, named from the input beside the button.
 *
 * @this {ChronicleApp}
 */
async function onCreateDelve() {
  const input = this.element.querySelector('input[name="delveName"]');
  const name = input?.value?.trim();
  if (!name) {
    ui.notifications?.warn(game.i18n.localize("VF.chronicle.NameTheDelve"));
    return;
  }

  const id = foundry.utils.randomID();
  await updateChronicle((chronicle) => ({
    ...chronicle,
    delves: [...chronicle.delves, newDelve(name, chronicle, id)],
  }));

  if (input) input.value = "";
  DelveApp.open(id);
}

/**
 * Open a delve's own window.
 *
 * @this {ChronicleApp}
 * @param {PointerEvent} _event - The click.
 * @param {HTMLElement} target - The button clicked.
 */
function onOpenDelve(_event, target) {
  const { delveId } = target.closest("[data-delve-id]")?.dataset ?? {};
  if (delveId) DelveApp.open(delveId);
}

/**
 * Drop a delve, after asking. The record and its window both go.
 *
 * @this {ChronicleApp}
 * @param {PointerEvent} _event - The click.
 * @param {HTMLElement} target - The button clicked.
 */
async function onDropDelve(_event, target) {
  const { delveId } = target.closest("[data-delve-id]")?.dataset ?? {};
  if (!delveId) return;

  const delve = getChronicle().delves.find((entry) => entry.id === delveId);
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("VF.chronicle.DropDelve") },
    content: `<p>${game.i18n.format("VF.chronicle.DropDelveConfirm", { name: delve?.name ?? "" })}</p>`,
  });
  if (!confirmed) return;

  for (const app of DelveApp.instances()) {
    if (app.delveId === delveId) await app.close();
  }
  await updateChronicle((chronicle) => ({
    ...chronicle,
    delves: chronicle.delves.filter((entry) => entry.id !== delveId),
  }));
}

export default class ChronicleApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "vf-chronicle",
    classes: ["vogelfrei", "vf-chronicle"],
    window: {
      title: "VF.chronicle.Title",
      icon: "fa-solid fa-hourglass-half",
      resizable: false,
    },
    position: { width: 320, height: "auto" },
    actions: {
      watchForward: onWatchForward,
      watchBack: onWatchBack,
      dayForward: onDayForward,
      createDelve: onCreateDelve,
      openDelve: onOpenDelve,
      dropDelve: onDropDelve,
    },
  };

  static PARTS = {
    main: { template: "/systems/vogelfrei/dist/templates/apps/chronicle.hbs" },
  };

  /** Open the Chronicle, or bring it forward if it is already up. */
  static show() {
    const [existing] = [...ChronicleApp.instances()];
    if (existing) {
      existing.bringToFront();
      return existing;
    }
    return new ChronicleApp().render(true);
  }

  /** @inheritDoc */
  async _prepareContext() {
    const chronicle = getChronicle();
    const watch = watchOf(chronicle.watch);

    return {
      isReferee: game.user.isGM,
      calendar: {
        day: chronicle.day,
        ordinal: watch.index + 1,
        label: `VF.chronicle.watch.${watch.key}`,
        daylight: watch.daylight,
        icon: watch.daylight ? "fa-sun" : "fa-moon",
        clock: clockOf(chronicle.watch),
      },
      delves: chronicle.delves.map((delve) => ({
        id: delve.id,
        name: delve.name,
        turn: delve.turn,
        penalised: restState(delve).penalised,
      })),
    };
  }
}

refreshOnChange(ChronicleApp);
