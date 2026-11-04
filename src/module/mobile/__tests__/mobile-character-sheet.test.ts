import type { QuenchMethods } from "../../../e2e";
import {
  cleanUpActorsByKey,
  cleanUpCompendium,
  cleanUpWorldItems,
  closeSheets,
  createActorTestItem,
  createMockActorKey,
  createMockCompendium,
  createWorldTestItem,
  trashChat,
  waitForElement,
  waitUntil,
} from "../../../e2e/testUtils";
import VogelfreiMobileCharacterSheet from "../character-sheet";
import VogelfreiMobileCompendiumPicker from "../compendium-picker";
import VogelfreiMobileItemSheet from "../item-sheet";
import { dismissMobileRollResult } from "../roll-results";

export const key = "vf.mobile.character-sheet";
export const options = { displayName: "VF: Mobile: Character Sheet" };

const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("Expected test document to exist");
  return value;
};

export default ({ it, expect, afterEach }: QuenchMethods) => {
  let previousCharacter: string | null = null;

  afterEach(async () => {
    await game.user?.update({ character: previousCharacter });
    dismissMobileRollResult();
    await closeSheets();
    await closeSheets();
    await cleanUpActorsByKey(key);
    await cleanUpCompendium();
    await cleanUpWorldItems();
    await trashChat();
    document.body.classList.remove("vf-mobile-mode");
    await game.settings.set(game.system.id, "mobileMode", false);
  });

  it("renders separately from the registered desktop sheet", async () => {
    const actor = required(await createMockActorKey("character", {}, key));
    const desktopSheet = actor.sheet;
    const sheet = new VogelfreiMobileCharacterSheet(actor);
    await sheet.render(true);

    expect(actor.sheet).equal(desktopSheet);
    expect(desktopSheet._getHeaderButtons().map((button) => button.class)).contain("vf-mobile-enter");
    expect(sheet.options.classes).contain("mobile-character-sheet");
    expect(sheet.options.template).contain("/templates/mobile/character-sheet.html");
    expect(sheet.element.find(".mobile-tabs .item")).to.have.length(4);
    expect(document.body.classList.contains("vf-mobile-mode")).equal(true);

    const sheetElement = required(sheet.element[0]);
    const sheetStyle = getComputedStyle(sheetElement);
    expect(sheetStyle.minWidth).equal("0px");
    expect(sheetStyle.minHeight).equal("0px");
    expect(sheetStyle.fontSize).equal("24px");
    expect(sheetElement.getBoundingClientRect().width).at.most(window.innerWidth);

    const tab = required(sheet.element.find(".mobile-sheet-body > .tab")[0]);
    const tabStyle = getComputedStyle(tab);
    expect(tabStyle.overflowY).equal("auto");
    expect(tabStyle.touchAction).equal("pan-y");
    await sheet.close();
    expect(game.settings.get(game.system.id, "mobileMode")).equal(false);
    expect(document.body.classList.contains("vf-mobile-mode")).equal(false);
  });

  it("uses touch-sized stats and separates score modifiers and save bonuses", async () => {
    const actor = required(await createMockActorKey("character", {}, key));
    await createActorTestItem(actor, "ability", "Test Ability");
    const sheet = new VogelfreiMobileCharacterSheet(actor);
    await sheet.render(true);

    const identityInput = required(sheet.element.find(".mobile-identity input")[0]);
    expect(getComputedStyle(identityInput).fontSize).equal("34px");
    const progression = required(sheet.element.find(".mobile-identity-progression")[0]);
    const progressionColumns = getComputedStyle(progression).gridTemplateColumns.split(" ");
    expect(progressionColumns).to.have.length(5);
    expect(new Set(progressionColumns).size).equal(1);
    expect(progression.querySelector("input[name='system.details.xp.value']")).not.null;
    expect(progression.querySelector("input[name='system.spells.enabled']")).null;

    const score = required(sheet.element.find(".ability-score[data-score='intelligence']")[0]);
    const scoreInput = required(score.querySelector(".attribute-value input") ?? undefined);
    const scoreModifier = required(score.querySelector(".score-mod") ?? undefined);
    const scoreLabel = required(score.querySelector(".attribute-name a") ?? undefined);
    expect(getComputedStyle(required(score.parentElement ?? undefined)).gridTemplateColumns.split(" ")).to.have.length(
      3,
    );
    expect(getComputedStyle(score).minHeight).equal("132px");
    expect(getComputedStyle(scoreInput).height).equal("72px");
    expect(getComputedStyle(scoreInput).fontSize).equal("48px");
    expect(getComputedStyle(scoreLabel).fontSize).equal("28px");
    expect(getComputedStyle(scoreModifier).position).equal("static");
    expect(getComputedStyle(scoreModifier).fontSize).equal("32px");
    expect(scoreInput.getBoundingClientRect().right).at.most(scoreModifier.getBoundingClientRect().left);

    const wounds = required(sheet.element.find("input[name='system.wounds.value']")[0]);
    const woundsGauge = required(wounds.closest(".health") ?? undefined);
    const staminaDie = required(sheet.element.find(".health.hit-dice")[0]);
    const resourceColumns = getComputedStyle(
      required(woundsGauge.parentElement ?? undefined),
    ).gridTemplateColumns.split(" ");
    expect(resourceColumns).to.have.length(3);
    expect(new Set(resourceColumns).size).equal(1);
    expect(getComputedStyle(required(sheet.element.find(".resource-labels div")[0])).fontSize).equal("24px");
    expect(getComputedStyle(wounds).height).equal("64px");
    expect(getComputedStyle(wounds).fontSize).equal("48px");
    expect(woundsGauge.getBoundingClientRect().height).equal(woundsGauge.getBoundingClientRect().width);
    expect(
      Math.abs(
        woundsGauge.getBoundingClientRect().top +
          woundsGauge.getBoundingClientRect().height / 2 -
          staminaDie.getBoundingClientRect().top -
          staminaDie.getBoundingClientRect().height / 2,
      ),
    ).at.most(1);

    const savingThrows = required(sheet.element.find("[data-save='magic']").closest(".attributes")[0]);
    const saveBonuses = required(sheet.element.find(".attribute-group.save-bonuses")[0]);
    expect(getComputedStyle(savingThrows).gridTemplateColumns.split(" ")).to.have.length(5);
    expect(
      getComputedStyle(required(saveBonuses.querySelector(".attributes") ?? undefined)).gridTemplateColumns.split(" "),
    ).to.have.length(2);
    expect(saveBonuses.getBoundingClientRect().top).at.least(savingThrows.getBoundingClientRect().bottom);

    const meleeSkills = required(sheet.element.find(".attack[data-attack='melee']").closest(".attributes")[0]);
    expect(getComputedStyle(meleeSkills).gridTemplateColumns.split(" ")).to.have.length(3);

    const abilityName = required(sheet.element.find("[data-tab='abilities'] .item-name")[0]);
    expect(getComputedStyle(abilityName).color).equal("rgba(0, 0, 0, 0.9)");
    const mobileTab = required(sheet.element.find(".mobile-tabs .item")[0]);
    expect(getComputedStyle(mobileTab).backgroundImage).equal("none");
    expect(getComputedStyle(mobileTab).color).equal("rgb(255, 255, 255)");
  });

  it("spaces item sections and keeps spell headings below the character name", async () => {
    const actor = required(await createMockActorKey("character", {}, key));
    await createActorTestItem(actor, "ability", "Test Ability");
    await actor.update({ "system.spells.enabled": true });
    const sheet = new VogelfreiMobileCharacterSheet(actor);
    await sheet.render(true);

    const exploration = required(sheet.element.find(".attributes.exploration")[0]);
    const abilities = required(sheet.element.find(".inventory.abilities")[0]);
    expect(getComputedStyle(exploration).marginBottom).equal("24px");
    expect(getComputedStyle(exploration).gridTemplateColumns.split(" ")).to.have.length(3);
    expect(getComputedStyle(abilities).marginTop).equal("24px");
    expect(getComputedStyle(required(abilities.querySelector(".item-list") ?? undefined)).overflow).equal("visible");

    const spellTab = required(sheet.element.find("[data-tab='spells'].tab")[0]);
    const spells = required(spellTab.querySelector(".inventory.spells") ?? undefined);
    const spellTitle = required(spells.querySelector(".item-category-title") ?? undefined);
    expect(getComputedStyle(spellTab).paddingTop).equal("16px");
    expect(getComputedStyle(spells).overflow).equal("visible");
    expect(getComputedStyle(spells).marginTop).equal("16px");
    expect(getComputedStyle(spellTitle).lineHeight).not.equal("15px");
    expect(getComputedStyle(required(abilities.querySelector(".item-name") ?? undefined)).fontSize).equal("34px");
  });

  it("uses touch-sized fields and buttons in roll dialogs", async () => {
    const actor = required(await createMockActorKey("character", {}, key));
    const sheet = new VogelfreiMobileCharacterSheet(actor);
    await sheet.render(true);

    const pendingRoll = actor.rollSave("magic");
    const form = required((await waitForElement(".application.dialog .roll-dialog")) ?? undefined);
    const formula = required(form.querySelector("input[name='formula']") ?? undefined);
    const bonus = required(form.querySelector("input[name='bonus']") ?? undefined);
    const rollMode = required(form.querySelector("select[name='rollMode']") ?? undefined);
    const label = required(form.querySelector(".form-group label") ?? undefined);
    expect(getComputedStyle(label).fontSize).equal("56px");
    for (const field of [formula, bonus, rollMode]) {
      expect(getComputedStyle(field).height).equal("128px");
      expect(getComputedStyle(field).fontSize).equal("56px");
    }

    const dialog = required(form.closest(".application.dialog") ?? undefined);
    const buttons = dialog.querySelectorAll(".form-footer button");
    expect(buttons.length).at.least(2);
    for (const button of buttons) {
      expect(getComputedStyle(button).minHeight).equal("128px");
      expect(getComputedStyle(button).fontSize).equal("56px");
    }

    required(dialog.querySelector<HTMLButtonElement>("button[data-action='cancel']") ?? undefined).click();
    await pendingRoll;
  });

  it("reveals the spell tab when spellcasting is enabled", async () => {
    const actor = required(await createMockActorKey("character", {}, key));
    const sheet = new VogelfreiMobileCharacterSheet(actor);
    await sheet.render(true);

    const input = sheet.element.find("input[name='system.spells.enabled']")[0] as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await waitUntil(() => actor.system.spells.enabled);
    const spellTab = await waitForElement(".mobile-character-sheet .mobile-tabs [data-tab='spells']");
    expect(spellTab).not.null;
  });

  it("creates a custom ability and opens its mobile editor", async () => {
    const actor = required(await createMockActorKey("character", {}, key));
    const sheet = new VogelfreiMobileCharacterSheet(actor);
    await sheet.render(true);

    await sheet._createCustomItem({ type: "ability" });

    expect(actor.items.getName("New Ability")).not.undefined;
    const editor = await waitForElement(".mobile-item-sheet");
    expect(editor).not.null;
  });

  for (const type of ["ability", "spell"]) {
    it(`saves and closes the mobile ${type} editor from a narrow viewport`, async () => {
      const actor = required(await createMockActorKey("character", {}, key));
      const item = required((await createActorTestItem(actor, type, "Test editor"))?.[0]);
      const editor = new VogelfreiMobileItemSheet(item);
      await editor.render(true);

      const save = required(editor.element.find<HTMLButtonElement>(".mobile-item-save")[0]);
      const close = required(editor.element.find<HTMLButtonElement>(".mobile-item-close")[0]);
      // Let Foundry finish the window's opening animation before measuring it.
      await new Promise((resolve) => setTimeout(resolve, 600));
      for (const control of [save, close]) {
        const bounds = control.getBoundingClientRect();
        expect(bounds.height).at.least(44);
        expect(bounds.left).at.least(0);
        expect(bounds.right).at.most(window.innerWidth);
        expect(bounds.bottom).at.most(window.innerHeight);
      }

      const footerTop = save.getBoundingClientRect().top;
      const content = required(editor.element.find<HTMLElement>(".window-content")[0]);
      content.scrollTop = content.scrollHeight;
      expect(save.getBoundingClientRect().top).equal(footerTop);

      const name = required(editor.element.find<HTMLInputElement>("input[name='name']")[0]);
      name.value = "Saved editor";
      save.click();
      await waitUntil(() => !save.isConnected);
      expect(item.name).equal("Saved editor");
    });
  }

  it("imports a matching item from a compendium", async () => {
    const actor = required(await createMockActorKey("character", {}, key));
    const pack = await createMockCompendium("Item");
    const worldItem = required(await createWorldTestItem("weapon"));
    await pack.importDocument(worldItem);

    const picker = new VogelfreiMobileCompendiumPicker(actor, { type: "weapon" });
    const data = await picker.getData();
    expect(data.entries.map((entry) => entry.name)).contain(worldItem.name);

    await picker.render(true);
    const button = await waitForElement<HTMLButtonElement>(".mobile-compendium-picker .compendium-add");
    button?.click();
    await waitUntil(() => Boolean(actor.items.getName(worldItem.name)));

    expect(actor.items.getName(worldItem.name)?.type).equal("weapon");
  });

  it("reorders items and moves them into and out of containers", async () => {
    const actor = required(await createMockActorKey("character", {}, key));
    const sheet = new VogelfreiMobileCharacterSheet(actor);
    const first = required((await createActorTestItem(actor, "weapon", "First"))?.[0]);
    const second = required((await createActorTestItem(actor, "weapon", "Second"))?.[0]);
    const container = required((await createActorTestItem(actor, "container", "Bag"))?.[0]);

    await sheet._reorderItem(first, 1);
    const weapons = actor.system.weapons.map((item: Item) => item.name);
    expect(weapons).deep.equal(["Second", "First"]);

    await sheet._moveItemToContainer(first, container.id);
    expect(first.system.containerId).equal(container.id);
    expect(container.system.itemIds).contain(first.id);

    await sheet._moveItemToContainer(first, "");
    expect(first.system.containerId).equal("");
    expect(container.system.itemIds).not.contain(first.id);
    expect(second.system.containerId).equal("");
  });

  it("shows public results but conceals blind results", async () => {
    const actor = required(await createMockActorKey("character", {}, key));
    previousCharacter = game.user?.character?.id ?? null;
    await game.user?.update({ character: actor.id });
    const sheet = new VogelfreiMobileCharacterSheet(actor);
    await sheet.render(true);

    const speaker = ChatMessage.getSpeaker({ actor });
    await ChatMessage.create({
      speaker,
      content: '<div data-vf-roll="true"><span class="test-result">42</span></div>',
    });
    let popup = await waitForElement(".vf-mobile-roll-result");
    expect(popup?.textContent).contain("42");
    expect(getComputedStyle(required(popup ?? undefined)).color).equal("rgba(0, 0, 0, 0.9)");
    const result = required(popup?.querySelector(".test-result") ?? undefined);
    expect(getComputedStyle(result).color).equal("rgba(0, 0, 0, 0.9)");
    expect(getComputedStyle(result).fontSize).equal("24px");
    dismissMobileRollResult();

    await ChatMessage.create({
      speaker,
      blind: true,
      whisper: ChatMessage.getWhisperRecipients("GM"),
      content: '<div data-vf-roll="true"><span class="test-result">51</span></div>',
    });
    popup = await waitForElement(".vf-mobile-roll-result");
    expect(popup?.textContent).contain(game.i18n.localize("VF.mobile.BlindRollSent"));
    expect(popup?.textContent).not.contain("51");

    await game.user?.update({ character: previousCharacter });
  });
};
