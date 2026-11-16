/**
 * @file Contains tests for Character Sheet.
 */
// eslint-disable-next-line import/no-cycle
import type { QuenchMethods } from "../../../e2e";
import {
  cleanUpActorsByKey,
  closeDialogs,
  closeSheets,
  closeV2Dialogs,
  createMockActorKey,
  delay,
  openDialogs,
  openV2Dialogs,
  openWindows,
  renderApplication,
  trashChat,
  waitForInput,
  waitUntil,
} from "../../../e2e/testUtils";
import type VogelfreiActorSheetCharacter from "../character-sheet";

export const key = "vf.actor.sheet.character";
export const options = { displayName: "VF: Actor: Sheet: Character" };

export default ({ describe, it, expect, after, afterEach }: QuenchMethods) => {
  after(async () => {
    await cleanUpActorsByKey(key);
    await closeSheets();
  });

  describe("defaultOptions()", () => {
    it("Has correctly set defaultOptions", async () => {
      const actor = await createMockActorKey("character", {}, key);
      const sheet = actor?.sheet as unknown as VogelfreiActorSheetCharacter;

      expect(sheet.options.classes).contain("vf");
      expect(sheet.options.classes).contain("sheet");
      expect(sheet.options.classes).contain("actor");
      expect(sheet.options.classes).contain("character");

      expect(sheet.options.template).contain("/templates/actors/character-sheet.html");
      expect(sheet.options.width).equal(450);
      expect(sheet.options.height).equal(530);
      expect(sheet.options.resizable).is.true;

      expect(sheet.options.tabs.length).equal(1);
      expect(Object.keys(sheet.options.tabs[0])).contain("navSelector");
      expect(sheet.options.tabs[0].navSelector).equal(".sheet-tabs");
      expect(Object.keys(sheet.options.tabs[0])).contain("contentSelector");
      expect(sheet.options.tabs[0].contentSelector).equal(".sheet-body");
      expect(Object.keys(sheet.options.tabs[0])).contain("initial");
      expect(sheet.options.tabs[0].initial).equal("attributes");

      expect(sheet.options.scrollY.length).equal(1);
      expect(sheet.options.scrollY[0]).equal(".inventory");
    });

    after(async () => {
      await cleanUpActorsByKey(key);
    });
  });

  // @todo: Do we need separate test sfor this, or is getData() enough?
  describe("_prepareItems(data)", () => {});

  // @todo: this is not tested separately as a dialog, should we test it more?
  describe("generateScores()", () => {
    const scores = {
      strength: 0,
      intelligence: 0,
      agility: 0,
      willpower: 0,
      toughness: 0,
      leadership: 0,
    };

    it("renders the character creator", async () => {
      const actor = await createMockActorKey("character", {}, key);
      const sheet = actor?.sheet as unknown as VogelfreiActorSheetCharacter;

      sheet.generateScores();
      expect(await waitUntil(() => openWindows("creator").some((window) => window.rendered), { timeout: 1500 })).true;

      const windows = openWindows("creator");
      expect(windows.length).equal(1);
      expect(windows[0].options.height).equal(400);

      for (const window of windows) {
        await window.close();
      }
    });

    it("clicking on the dices generates scores", async () => {
      const actor = await createMockActorKey("character", {}, key);
      const sheet = actor?.sheet as unknown as VogelfreiActorSheetCharacter;

      sheet.generateScores();
      expect(await waitUntil(() => openWindows("creator").some((window) => window.rendered), { timeout: 1500 })).true;

      const windows = openWindows("creator");
      expect(windows.length).equal(1);

      // One button rolls the whole array, in order, rather than a die per
      // ability.
      const creator = windows[0];
      if (!creator) throw new Error("Character creator did not open");
      creator.element.find("button.roll-array").trigger("click");
      expect(
        await waitUntil(
          () =>
            creator.rendered &&
            creator.element
              .find(".score-value")
              .toArray()
              .every((cell) => Number(cell.textContent) >= 3),
          { timeout: 1500 },
        ),
      ).true;

      for (const score of Object.keys(scores)) {
        const cell = creator.element[0]?.querySelector(`.score-row[data-score="${score}"] .score-value`);
        expect(Number.parseInt(cell?.textContent ?? "0", 10) >= 3).equal(true);
      }

      for (const window of windows) {
        await window.close();
      }
    });

    it("saving scores records data to actor", async () => {
      const actor = await createMockActorKey("character", {}, key);
      const sheet = actor?.sheet as unknown as VogelfreiActorSheetCharacter;

      sheet.generateScores();
      expect(await waitUntil(() => openWindows("creator").some((window) => window.rendered), { timeout: 1500 })).true;

      const windows = openWindows("creator");
      expect(windows.length).equal(1);

      const creator = windows[0];
      if (!creator) throw new Error("Character creator did not open");
      creator.element.find("button.roll-array").trigger("click");
      expect(
        await waitUntil(
          () =>
            creator.rendered &&
            creator.element
              .find(".score-value")
              .toArray()
              .every((cell) => Number(cell.textContent) >= 3),
          { timeout: 1500 },
        ),
      ).true;

      for (const score of Object.keys(scores)) {
        const cell = creator.element[0]?.querySelector(`.score-row[data-score="${score}"] .score-value`);
        const value = Number.parseInt(cell?.textContent ?? "0", 10);
        expect(value >= 3).equal(true);
        scores[score] = value;
      }

      creator.element.find("button[type='submit']").trigger("click");
      expect(
        await waitUntil(
          () => Object.entries(scores).every(([score, value]) => actor?.system.scores[score].value === value),
          { timeout: 1500 },
        ),
      ).true;

      expect(actor?.system.scores.strength.value).equal(scores.strength);
      expect(actor?.system.scores.agility.value).equal(scores.agility);
      expect(actor?.system.scores.willpower.value).equal(scores.willpower);
      expect(actor?.system.scores.intelligence.value).equal(scores.intelligence);
      expect(actor?.system.scores.toughness.value).equal(scores.toughness);
      expect(actor?.system.scores.leadership.value).equal(scores.leadership);
    });

    afterEach(async () => {
      await closeDialogs();
      // An array that was rolled but not accepted stays on the user, so clear
      // it or the next test opens the generator holding the previous one.
      await game.user?.unsetFlag(game.system.id, "pendingRoll");
    });

    afterEach(async () => {
      // Don't delete actors or close windows in bulk, as it interferes with the
      // tests still running.
      await trashChat();
      await delay(300);
    });

    after(async () => {
      await cleanUpActorsByKey(key);
    });
  });

  describe("getData()", () => {
    it("returns the expected data", async () => {
      const actor = await createMockActorKey("character", {}, key);
      const data = await actor?.sheet?.getData();

      expect(Object.keys(data)).contain("enrichedBiography");
      expect(Object.keys(data)).contain("enrichedNotes");

      // _prepareItems tests
      expect(Object.keys(data)).contain("owned");
      expect(Object.keys(data?.owned)).contain("weapons");
      expect(Object.keys(data?.owned)).contain("items");
      expect(Object.keys(data?.owned)).contain("containers");
      expect(Object.keys(data?.owned)).contain("armors");
      expect(Object.keys(data?.owned)).contain("treasures");
      expect(Object.keys(data)).contain("containers");
      expect(Object.keys(data)).contain("abilities");
      expect(Object.keys(data)).contain("spells");
      expect(Object.keys(data)).contain("slots");
      expect(Object.keys(data)).contain("system");
      expect(Object.keys(data?.system)).contain("usesAscendingAC");
      expect(Object.keys(data?.system)).contain("meleeMod");
      expect(Object.keys(data?.system)).contain("rangedMod");
      expect(Object.keys(data?.system)).contain("init");
    });

    it("shows only explicitly recorded unknown languages", async () => {
      const actor = await createMockActorKey("character", {}, key);
      await actor?.update({ "system.languages": { value: ["Common"], unknown: ["Dwarvish"] } });

      const data = await actor?.sheet.getData();
      expect(data?.unknownLanguages).deep.equal(["Dwarvish"]);
      expect(CONFIG.VF.languages).not.include.members(["Lawful", "Chaotic", "Neutral"]);
    });

    after(async () => {
      await cleanUpActorsByKey(key);
    });
  });

  describe("_chooseLang()", () => {
    it("renders a dialog", async () => {
      const actor = await createMockActorKey("character", {}, key);
      // eslint-disable-next-line no-underscore-dangle
      actor?.sheet?._chooseLang();
      await waitForInput();

      const dialogs = openV2Dialogs();
      expect(dialogs.length).equal(1);
      dialogs[0].close();
    });

    after(async () => {
      await cleanUpActorsByKey(key);
      await closeV2Dialogs();
      await delay(300);
    });
  });

  describe("_pushLang(table)", () => {
    const table = "languages";

    it("renders a dialog", async () => {
      const actor = await createMockActorKey("character", {}, key);
      // eslint-disable-next-line no-underscore-dangle
      actor?.sheet?._pushLang(table);
      expect(await waitUntil(() => openV2Dialogs().some((dialog) => dialog.rendered), { timeout: 1000 })).true;

      const dialogs = openV2Dialogs();
      expect(dialogs.length).equal(1);
      await dialogs[0].close();
    });

    it("adds language on OK", async () => {
      const actor = await createMockActorKey("character", {}, key);
      // eslint-disable-next-line no-underscore-dangle
      const pending = actor?.sheet?._pushLang(table);
      expect(await waitUntil(() => openV2Dialogs().some((dialog) => dialog.rendered), { timeout: 1000 })).true;
      openV2Dialogs()[0]?.element.querySelector<HTMLButtonElement>(`button[data-action="ok"]`)?.click();
      await pending;
      expect(await waitUntil(() => openV2Dialogs().length === 0, { timeout: 1000 })).true;

      const dialogs = openV2Dialogs();
      expect(dialogs.length).equal(0);

      expect(actor?.system.languages.value.length).equal(1);
      expect(actor?.system.languages.value[0]).equal("Common");
    });

    it("moves a language from unknown to known without duplicates", async () => {
      const actor = await createMockActorKey("character", {}, key);
      await actor?.update({ "system.languages": { value: [], unknown: ["Common"] } });

      const pending = actor?.sheet?._pushLang(table);
      expect(await waitUntil(() => openV2Dialogs().some((dialog) => dialog.rendered), { timeout: 1000 })).true;
      openV2Dialogs()[0]?.element.querySelector<HTMLButtonElement>(`button[data-action="ok"]`)?.click();
      await pending;
      expect(await waitUntil(() => openV2Dialogs().length === 0, { timeout: 1000 })).true;

      expect(actor?.system.languages.value).deep.equal(["Common"]);
      expect(actor?.system.languages.unknown).deep.equal([]);
    });

    it("adds a failed encounter to unknown only once", async () => {
      const actor = await createMockActorKey("character", {}, key);
      await actor?.update({ "system.languages": { value: ["Common"], unknown: [] } });

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const pending = actor?.sheet?._pushLang(table, "unknown");
        expect(await waitUntil(() => openV2Dialogs().some((dialog) => dialog.rendered), { timeout: 1000 })).true;
        openV2Dialogs()[0]?.element.querySelector<HTMLButtonElement>(`button[data-action="ok"]`)?.click();
        await pending;
        expect(await waitUntil(() => openV2Dialogs().length === 0, { timeout: 1000 })).true;
      }

      expect(actor?.system.languages.value).deep.equal([]);
      expect(actor?.system.languages.unknown).deep.equal(["Common"]);
    });

    after(async () => {
      await cleanUpActorsByKey(key);
      await closeV2Dialogs();
    });
  });

  describe("_popLang(table, lang)", () => {
    const table = "languages";

    it("can remove added language", async () => {
      const actor = await createMockActorKey("character", {}, key);
      await actor?.update({ "system.languages.value": ["Common"] });
      await waitForInput();

      expect(actor?.system.languages.value.length).equal(1);
      expect(actor?.system.languages.value[0]).equal("Common");

      // eslint-disable-next-line no-underscore-dangle
      actor?.sheet?._popLang(table, "Common");
      await waitForInput();

      expect(actor?.system.languages.value.length).equal(0);
    });

    it("can remove an unknown language without changing known languages", async () => {
      const actor = await createMockActorKey("character", {}, key);
      await actor?.update({ "system.languages": { value: ["Common"], unknown: ["Dwarvish"] } });

      await actor?.sheet?._popLang(table, "Dwarvish", "unknown");

      expect(actor?.system.languages.value).deep.equal(["Common"]);
      expect(actor?.system.languages.unknown).deep.equal([]);
    });

    after(async () => {
      await cleanUpActorsByKey(key);
    });
  });

  describe("_onShowModifiers(event)", () => {
    it("renders a dialog", async () => {
      const actor = await createMockActorKey("character", {}, key);
      await actor?.update({
        system: {
          scores: {
            strength: { value: 10 },
            agility: { value: 10 },
            intelligence: { value: 10 },
            toughness: { value: 10 },
            willpower: { value: 10 },
            leadership: { value: 10 },
          },
        },
      });
      const sheet = await renderApplication(actor?.sheet);
      sheet.element.find('.profile a[data-action="modifiers"]').trigger("click");
      expect(await waitUntil(() => openDialogs().some((dialog) => dialog.rendered), { timeout: 1500 })).true;

      const dialogs = openDialogs();
      expect(dialogs.length).equal(1);
    });

    after(async () => {
      await cleanUpActorsByKey(key);
      await closeDialogs();
      await delay(400);
    });
  });

  describe("_onShowGpCost(event, preparedData)", () => {
    it("renders a dialog", async () => {
      const actor = await createMockActorKey("character", {}, key);
      await actor?.update({
        system: {
          scores: {
            strength: { value: 10 },
            agility: { value: 10 },
            intelligence: { value: 10 },
            toughness: { value: 10 },
            willpower: { value: 10 },
            leadership: { value: 10 },
          },
        },
      });
      actor?.sheet?.render(true);
      await waitForInput();

      $(`.sheet .profile a[data-action="gp-cost"]`).trigger("click");
      await delay(200);

      const dialogs = openDialogs();
      expect(dialogs.length).equal(1);
    });

    after(async () => {
      await cleanUpActorsByKey(key);
      await closeDialogs();
      await delay(400);
    });
  });

  // @todo: This seems unfinished
  describe("_onShowItemTooltip(event)", () => {});
};
