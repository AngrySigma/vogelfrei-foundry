/**
 * @file Contains tests for Character Modifiers sheet.
 */
// eslint-disable-next-line prettier/prettier, import/no-cycle
import type { QuenchMethods } from "../../../e2e";
import { cleanUpActorsByKey, createMockActorKey, openWindows, waitForInput } from "../../../e2e/testUtils";
import VogelfreiCharacterModifiers from "../character-modifiers";

export const key = "vf.actor.sheet.character.dialog.modifiers";
export const options = {
  displayName: "VF: Actor: Dialog Sheet: Character Modifiers",
};

const createMockActor = async (type: string, data: object = {}) => createMockActorKey(type, data, key);

export default ({ describe, it, expect, assert, after }: QuenchMethods) => {
  describe("defaultOptions()", () => {
    it("Has correctly set defaultOptions", () => {
      const sheet = new VogelfreiCharacterModifiers();
      expect(sheet.options.id).equal("sheet-modifiers");
      expect(sheet.options.classes).contain("vf");
      expect(sheet.options.classes).contain("dialog");
      expect(sheet.options.classes).contain("modifiers");
      expect(sheet.options.template).contain("/templates/actors/dialogs/modifiers-dialog.html");
      expect(sheet.options.width).equal(240);
    });
  });

  describe("title()", () => {
    it("Creates string in dialog window title", async () => {
      const actor = await createMockActor("character");
      const sheet = new VogelfreiCharacterModifiers(actor);
      sheet.render(true);
      await waitForInput();
      const dialogTitle = document.querySelector("div.modifiers .window-title")?.innerHTML;
      expect(typeof dialogTitle).equal("string");
      const dialogs = openWindows("modifiers");
      expect(dialogs.length).equal(1);
      await dialogs[0].close();
      expect(openWindows("modifiers").length).equal(0);
    });
  });

  describe("getData()", () => {
    it("Returns proper data", async () => {
      const actor = await createMockActor("character");
      const sheet = new VogelfreiCharacterModifiers(actor);
      const data = sheet.getData();
      const keys = Object.keys(data);
      assert(keys.length > 0);
      expect(keys).contain("user");
    });
  });

  after(async () => {
    await cleanUpActorsByKey(key);
  });
};
