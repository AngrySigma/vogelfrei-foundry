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
  trashChat,
  waitForInput,
} from "../../../e2e/testUtils";
import type OseActorSheetCharacter from "../character-sheet";

export const key = "ose.actor.sheet.character";
export const options = { displayName: "OSE: Actor: Sheet: Character" };

export default ({ describe, it, expect, after, afterEach }: QuenchMethods) => {
  after(async () => {
    await cleanUpActorsByKey(key);
    await closeSheets();
  });

  describe("defaultOptions()", () => {
    it("Has correctly set defaultOptions", async () => {
      const actor = await createMockActorKey("character", {}, key);
      const sheet = actor?.sheet as unknown as OseActorSheetCharacter;

      expect(sheet.options.classes).contain("ose");
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
      const sheet = actor?.sheet as unknown as OseActorSheetCharacter;

      sheet.generateScores();
      await waitForInput();

      const windows = openWindows("creator");
      expect(windows.length).equal(1);

      for (const window of windows) {
        await window.close();
      }
    });

    it("clicking on the dices generates scores", async () => {
      const actor = await createMockActorKey("character", {}, key);
      const sheet = actor?.sheet as unknown as OseActorSheetCharacter;

      sheet.generateScores();
      await delay(400);

      const windows = openWindows("creator");
      expect(windows.length).equal(1);

      // One button rolls the whole array, in order, rather than a die per
      // ability.
      $(".creator button.roll-array").trigger("click");
      await delay(400);

      for (const score of Object.keys(scores)) {
        const cell = document.querySelector(`.creator .score-row[data-score="${score}"] .score-value`);
        expect(Number.parseInt(cell?.textContent ?? "0", 10) >= 3).equal(true);
      }

      for (const window of windows) {
        await window.close();
      }
    });

    // @todo: this needs fixing
    it("saving scores records data to actor", async () => {
      const actor = await createMockActorKey("character", {}, key);
      const sheet = actor?.sheet as unknown as OseActorSheetCharacter;

      sheet.generateScores();
      await delay(400);

      const windows = openWindows("creator");
      expect(windows.length).equal(1);

      $(".creator button.roll-array").trigger("click");
      await delay(400);

      for (const score of Object.keys(scores)) {
        const cell = document.querySelector(`.creator .score-row[data-score="${score}"] .score-value`);
        const value = Number.parseInt(cell?.textContent ?? "0", 10);
        expect(value >= 3).equal(true);
        scores[score] = value;
      }

      $(".creator button[type='submit']").trigger("submit");
      await waitForInput();

      expect(actor?.system.scores.strength.value).equal(scores.strength);
      expect(actor?.system.scores.agility.value).equal(scores.agility);
      expect(actor?.system.scores.willpower.value).equal(scores.willpower);
      expect(actor?.system.scores.intelligence.value).equal(scores.intelligence);
      expect(actor?.system.scores.toughness.value).equal(scores.toughness);
      expect(actor?.system.scores.leadership.value).equal(scores.leadership);
    });

    afterEach(async () => {
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
      await waitForInput();

      const dialogs = openV2Dialogs();
      expect(dialogs.length).equal(1);
      dialogs[0].close();
    });

    it("adds language on OK", async () => {
      const actor = await createMockActorKey("character", {}, key);
      // eslint-disable-next-line no-underscore-dangle
      actor?.sheet?._pushLang(table);
      await delay(220);

      $(`button[data-action="ok"]`).trigger("click");
      await delay(500);

      const dialogs = openV2Dialogs();
      expect(dialogs.length).equal(0);

      expect(actor?.system.languages.value.length).equal(1);
      expect(actor?.system.languages.value[0]).equal("Common");
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
      actor?.sheet?.render(true);
      await waitForInput();

      $(`.sheet .profile a[data-action="modifiers"]`).trigger("click");
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
