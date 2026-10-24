/**
 * @file Helpful methods for dealing with OSE-specific dice logic
 */
import { cappedArmourModifier, targetArmourRating } from "./actor/armour-modifier";
import { ARMOUR_CLASS_VARIANTS } from "./actor/data-model-classes/data-model-character-ac";
import { skillDice, skillRollMode, skillSucceeds } from "./actor/exploration-skills";
import { stanceAttack } from "./actor/stance";
import { clearStance, currentStance, setStance } from "./actor/stance-store";
import OSE from "./config";
import { getRollMode, getRollModes } from "./helpers-message-mode";

/**
 * Damage of a weapon two or more length grades longer, used inside the
 * opponent's reach: whatever it normally rolls, it keeps the lower of 2d8 and
 * gains nothing from its length (Measure and Reach.md).
 */
const INSIDE_REACH_DAMAGE = "2d8kl";

/** The stances an attack can be made in. Guard makes no attack. */
const ATTACK_STANCES = ["press", "defensive"];

const OseDice = {
  async sendRoll({
    parts = [],
    data = {},
    title = null,
    flavor = null,
    speaker = null,
    form = null,
    chatMessage = true,
  } = {}) {
    const template = `${OSE.systemPath()}/templates/chat/roll-result.html`;

    const chatData = {
      user: game.user.id,
      speaker,
    };

    const templateData = {
      title,
      flavor,
      data,
      config: CONFIG.OSE,
    };

    if (data.roll?.type === "skill") {
      // A situational modifier moves the x in 6, not the die: -1 on a 1-in-6
      // makes it 0 in 6, which is a long shot on 2d6 (Skills.md).
      const shift = Number(form?.bonus.value || 0);
      if (!Number.isFinite(shift)) ui.notifications.warn(game.i18n.localize("VF.roll.skillModifierNumber"));
      data.roll.target += Number.isFinite(shift) ? Math.trunc(shift) : 0;
      data.roll.mode = skillRollMode(data.roll.target);
      parts.splice(0, parts.length, skillDice(data.roll.mode));
    } else if (form?.bonus.value) {
      // Optionally include a situational bonus
      parts.push(form.bonus.value);
    }

    const roll = new Roll(parts.join("+"), data);
    await roll.evaluate({ allowStrings: true });

    // Convert the roll to a chat message and return the roll
    let rollMode = getRollMode();
    rollMode = form ? form.rollMode.value : rollMode;

    // Force blind roll (ability formulas)
    if (!form && data.roll.blindroll) {
      rollMode = game.user.isGM ? "selfroll" : "blindroll";
    }

    if (["gmroll", "blindroll"].includes(rollMode)) chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "selfroll") chatData.whisper = [game.user._id];
    if (rollMode === "blindroll") {
      chatData.blind = true;
      data.roll.blindroll = true;
    }

    templateData.result = OseDice.digestResult(data, roll);

    return new Promise((resolve) => {
      roll.render().then((r) => {
        templateData.rollOSE = r;
        foundry.applications.handlebars.renderTemplate(template, templateData).then((content) => {
          chatData.content = content;
          // Dice So Nice
          if (game.dice3d) {
            game.dice3d.showForRoll(roll, game.user, true, chatData.whisper, chatData.blind).then(() => {
              if (chatMessage !== false) ChatMessage.create(chatData);
              resolve(roll);
            });
          } else {
            chatData.sound = CONFIG.sounds.dice;
            if (chatMessage !== false) ChatMessage.create(chatData);
            resolve(roll);
          }
        });
      });
    });
  },

  /**
   * Digesting results depending on type of roll
   *
   * @param {object} data - Contains roll data, including what type of check
   * @param {object} roll - Evaluated Roll returned object
   * @returns {object} - Object containing the evaluated data // @todo DigestResult
   */
  digestResult(data, roll) {
    // @todo: Extract this to a DigestResult type/interface
    const result = {
      isSuccess: false,
      isFailure: false,
      target: data.roll.target,
      total: roll.total,
    };

    const die = roll.dice?.[0]?.results?.[0]?.result ?? roll.total;
    // eslint-disable-next-line default-case
    switch (data.roll.type) {
      case "result": {
        if (roll.total === result.target) {
          result.isSuccess = true;
        } else {
          result.isFailure = true;
        }

        break;
      }

      case "above": {
        // SAVING THROWS
        if (roll.total >= result.target) {
          result.isSuccess = true;
        } else {
          result.isFailure = true;
        }

        break;
      }

      case "skill": {
        // EXPLORATION: x in 6, or 2d6 at the extremes. The faces decide, not
        // the total, so a situational bonus typed into the dialog cannot turn
        // a double 6 into a success.
        const faces = roll.dice?.[0]?.results?.map(({ result: face }) => face) ?? [];
        if (skillSucceeds(data.roll.mode, faces, Number(result.target))) result.isSuccess = true;
        else result.isFailure = true;
        break;
      }

      case "below": {
        // MORALE
        if (roll.total <= result.target) {
          result.isSuccess = true;
        } else {
          result.isFailure = true;
        }

        break;
      }

      case "check": {
        // SCORE CHECKS (1s and 20s)
        if (die === 1 || (roll.total <= result.target && die < 20)) {
          result.isSuccess = true;
        } else {
          result.isFailure = true;
        }

        break;
      }

      case "table": {
        // Reaction
        const { table } = data.roll;
        let output = Object.values(table)[0];
        for (let i = 0; i <= roll.total; i++) {
          if (table[i]) {
            output = table[i];
          }
        }
        result.details = output;

        break;
      }

      default: {
        result.isSuccess = false;
        result.isFailure = false;

        break;
      }
    }
    return result;
  },

  /**
   * Evaluates if a roll is successful for both THAC0 and Ascending AC
   *
   * @param {object} roll - Evaluated roll data from a Roll
   * @param {number} thac0 - THAC0 value, or Hit Target when AscendingAC
   * @param {number} ac - AC Value, or Attack Bonus when AscendingAC
   * @returns {boolean} - Did the attack succeed?
   */
  attackIsSuccess(roll, thac0, ac) {
    // Natural 1
    if (roll.terms[0].results[0].result === 1) {
      return false;
    }
    // Natural 20
    if (roll.terms[0].results[0].result === 20) {
      return true;
    }
    return roll.total + ac >= thac0;
  },

  /**
   * Digest the results of a target to reach, and an evaluated roll
   * to evaluate if it does hit or not. The function adds information
   * for generating chat card data too.
   *
   * @param {object} data - Data with at least roll target data
   * @param {object} roll - Evaluation result from a Roll
   * @returns {object} - DigestResult
   */
  digestAttackResult(data, roll) {
    // @todo: Extract this to a DigestResult type/interface
    const result = {
      isSuccess: false,
      isFailure: false,
      target: "",
      total: roll.total,
    };
    // Vogelfrei is ascending-only and hits on equal or greater. The defender's
    // AC depends on which variant the attacker chose in the dialog; against no
    // target we report the total and leave the call to the Referee.
    const targetActorData = data.roll.target?.actor?.system || null;
    const variant = data.roll.acVariant || (data.roll.type === "missile" ? "ranged" : "melee");

    // A character carries a table of ACs, one per variant; a monster carries
    // the single number the Referee typed. Reading only the table left every
    // attack on a monster with no AC to beat, which reported as a hit.
    const targetAcData = targetActorData?.ac;
    const variantAc = targetAcData?.values?.[variant];
    const targetAc = (typeof variantAc === "number" ? variantAc : targetAcData?.value) ?? null;

    result.victim = data.roll.target || null;
    result.target = targetAc;

    // A natural 20 always hits and is a critical; a natural 1 always misses.
    // Read the die face itself rather than the term's total: for `1d20` they
    // agree, but the face is what the rule is about, and it is how
    // attackIsSuccess has always read it.
    const natural = roll.terms?.[0]?.results?.[0]?.result ?? null;
    result.isCritical = natural === 20;

    if (natural === 1) {
      result.details = game.i18n.localize("VF.messages.AttackNatural1");
      result.isFailure = true;
    } else if (result.isCritical) {
      result.details = game.i18n.localize("VF.messages.AttackNatural20");
      result.isSuccess = true;
    } else if (targetAc === null) {
      result.details = game.i18n.format("VF.messages.AttackAscendingSuccess", { result: roll.total });
      result.isSuccess = true;
    } else if (roll.total >= targetAc) {
      result.details = game.i18n.format("VF.messages.AttackAscendingSuccess", { result: roll.total });
      result.isSuccess = true;
    } else {
      result.details = game.i18n.format("VF.messages.AttackAscendingFailure", { bonus: targetAc });
      result.isFailure = true;
    }

    return result;
  },

  /**
   * Puts together the information needed to roll a Roll and the
   * expectations on hitting a target. Also creates the chat card
   * containing the infromation about the evaluated roll.
   *
   * @param {object} param0 - Object to evaluate
   * @param {Array<String || number>} param0.parts - Roll parts (e.g. ["1d20", "3", "0", "0"])
   * @param {object} param0.data - Object containing target data
   * @param {object} param0.data.roll - Roll target data
   * @param {Array<String || number|} param0.data.roll.dmg - Roll parts for damage roll if hit
   * @param {Actor | null} param0.data.target - Target data for the intended hit target
   * @param {object} param0.flags -Not used directly in function, but may be passed on
   * @param {string} param0.title - Modified in RollSave() if magic save required
   * @param {string} param0.flavor - Not used directly in function
   * @param {object} param0.speaker - Speaker data for the chat card
   * @param {object} param0.form - Data from the Dialog Form that generates data for the function
   * @returns {Promise || Void} - Either not returning anything, or a Promise for rendering a Chat Card
   */
  async sendAttackRoll({
    parts = [],
    data = {},
    flags = {},
    title = null,
    flavor = null,
    speaker = null,
    form = null,
  } = {}) {
    if (data.roll.dmg.filter((v) => v !== "").length === 0) {
      /**
       * @todo should this error be localized?
       */
      ui.notifications.error("Attack has no damage dice terms; be sure to set the attack's damage");
      return;
    }
    const template = `${OSE.systemPath()}/templates/chat/roll-attack.html`;
    const chatData = {
      user: game.user.id,
      speaker,
      flags,
    };

    const templateData = {
      title,
      flavor,
      data,
      config: CONFIG.OSE,
    };

    // Optionally include a situational bonus
    if (form?.bonus.value) parts.push(form.bonus.value);

    // Weapon length: a shorter weapon pays to work past a longer one. Inside
    // the reach length counts for nothing, and a weapon two or more grades
    // longer keeps the lower die.
    const length = form?.weaponLength?.value;
    if (length === "inside") data.roll.dmg = [INSIDE_REACH_DAMAGE, ...data.roll.dmg.slice(1)];
    else if (length && Number(length) !== 0) parts.push(length);

    // Which of the defender's armour classes this attack is measured against.
    if (form?.acVariant?.value) data.roll.acVariant = form.acVariant.value;

    // Press or Defensive Fighting, declared with the attack. The choice also
    // sets the attacker's stance, so their AC follows for the rest of the
    // Round. Without a dialog, whatever stance they are already in counts.
    if (data.roll.stances && data.actor) {
      const held = currentStance(data.actor);
      const chosen = form?.stance ? form.stance.value || null : held;
      const stance = ATTACK_STANCES.includes(chosen) ? chosen : null;
      const attack = stanceAttack(stance);
      if (attack) parts.push(attack);
      if (stance && stance !== held) await setStance(data.actor, stance);
      else if (!stance && ATTACK_STANCES.includes(held)) await clearStance(data.actor);
    }

    // The weapon's armour modifier, capped by the target's Armour Rating
    // (shield included). Never against a firearm AC: a gun has none, and the
    // firearm rating already says what armour is worth against a ball.
    const firearmAc = data.roll.firearm || data.roll.acVariant === "firearm";
    if (data.roll.armourModifier && !firearmAc) {
      const rating = targetArmourRating(data.roll.target?.actor?.system, data.roll.type === "missile");
      const armour = cappedArmourModifier(data.roll.armourModifier, rating);
      if (armour) parts.push(armour);
    }

    const roll = new Roll(parts.join("+"), data);
    await roll.evaluate();
    const dmgRoll = new Roll(data.roll.dmg.join("+"), data);
    await dmgRoll.evaluate();

    // Convert the roll to a chat message and return the roll
    let rollMode = getRollMode();
    rollMode = form ? form.rollMode.value : rollMode;

    // Force blind roll (ability formulas)
    if (data.roll.blindroll) {
      rollMode = game.user.isGM ? "selfroll" : "blindroll";
    }

    if (["gmroll", "blindroll"].includes(rollMode)) chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "selfroll") chatData.whisper = [game.user._id];
    if (rollMode === "blindroll") {
      chatData.blind = true;
      data.roll.blindroll = true;
    }

    templateData.result = OseDice.digestAttackResult(data, roll);

    return new Promise((resolve) => {
      roll.render().then((r) => {
        templateData.rollOSE = r;
        dmgRoll.render().then((dr) => {
          templateData.rollDamage = dr;
          foundry.applications.handlebars.renderTemplate(template, templateData).then((content) => {
            chatData.content = content;
            // 2 Step Dice So Nice
            if (game.dice3d) {
              game.dice3d.showForRoll(roll, game.user, true, chatData.whisper, chatData.blind).then(() => {
                if (templateData.result.isSuccess) {
                  templateData.result.dmg = dmgRoll.total;
                  game.dice3d.showForRoll(dmgRoll, game.user, true, chatData.whisper, chatData.blind).then(() => {
                    ChatMessage.create(chatData);
                    resolve(roll);
                  });
                } else {
                  ChatMessage.create(chatData);
                  resolve(roll);
                }
              });
            } else {
              chatData.sound = CONFIG.sounds.dice;
              ChatMessage.create(chatData);
              resolve(roll);
            }
          });
        });
      });
    });
  },

  async RollSave({
    parts = [],
    data = {},
    skipDialog = false,
    speaker = null,
    flavor = null,
    title = null,
    chatMessage = true,
  } = {}) {
    let rolled = false;
    const template = `${OSE.systemPath()}/templates/chat/roll-dialog.html`;
    const dialogData = {
      formula: parts.join(" "),
      data,
      rollMode: getRollMode(),
      rollModes: getRollModes(),
    };

    const rollData = {
      parts,
      data,
      title,
      flavor,
      speaker,
      chatMessage,
    };
    if (skipDialog) {
      return OseDice.sendRoll(rollData);
    }

    let roll;

    const buttons = [
      {
        action: "ok",
        label: game.i18n.localize("VF.Roll"),
        icon: "fas fa-dice-d20",
        callback: (_event, button) => {
          rolled = true;
          rollData.form = button.form;
          roll = OseDice.sendRoll(rollData);
        },
      },
      {
        action: "magic",
        label: game.i18n.localize("VF.saveBonus.magic.short"),
        icon: "fas fa-magic",
        callback: (_event, button) => {
          rolled = true;
          rollData.form = button.form;
          rollData.parts.push(`${rollData.data.roll.magic}`);
          rollData.title += ` ${game.i18n.localize("VF.saveBonus.magic.short")} (${rollData.data.roll.magic})`;
          roll = OseDice.sendRoll(rollData);
        },
      },
      {
        action: "nonmagic",
        label: game.i18n.localize("VF.saveBonus.nonmagic.short"),
        icon: "fas fa-hand-fist",
        callback: (_event, button) => {
          rolled = true;
          rollData.form = button.form;
          rollData.parts.push(`${rollData.data.roll.nonmagic}`);
          rollData.title += ` ${game.i18n.localize("VF.saveBonus.nonmagic.short")} (${rollData.data.roll.nonmagic})`;
          roll = OseDice.sendRoll(rollData);
        },
      },
      {
        action: "cancel",
        icon: "fas fa-times",
        label: game.i18n.localize("VF.Cancel"),
        callback: () => {},
      },
    ];

    const html = await foundry.applications.handlebars.renderTemplate(template, dialogData);

    // Create Dialog window
    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: title || "" },
        content: html,
        buttons,
        default: "ok",
        submit: () => {
          resolve(rolled ? roll : false);
        },
      }).render(true);
    });
  },

  async Roll({
    parts = [],
    data = {},
    skipDialog = false,
    speaker = null,
    flavor = null,
    title = null,
    chatMessage = true,
    flags = {},
  } = {}) {
    let rolled = false;
    const template = `${OSE.systemPath()}/templates/chat/roll-dialog.html`;
    const isAttack = ["melee", "missile", "attack"].includes(data.roll.type);
    const held = data.roll.stances ? currentStance(data.actor) : null;
    const dialogData = {
      formula: parts.join(" "),
      data,
      isAttack,
      // Weapon length and stances are melee business only.
      isMelee: isAttack && data.roll.type !== "missile",
      stances: data.roll.stances
        ? [
            { value: "", label: "VF.stance.none", selected: !ATTACK_STANCES.includes(held) },
            ...ATTACK_STANCES.map((kind) => ({
              value: kind,
              label: `VF.stance.${kind}.label`,
              selected: held === kind,
            })),
          ]
        : null,
      // Only offer the ACs that can answer this kind of attack.
      acVariants: ARMOUR_CLASS_VARIANTS.filter((v) => v.ranged === (data.roll.type === "missile")),
      rollMode: data.roll.blindroll ? "blindroll" : getRollMode(),
      rollModes: getRollModes(),
    };
    const rollData = {
      parts,
      data,
      title,
      flavor,
      speaker,
      chatMessage,
      flags,
    };
    if (skipDialog) {
      return ["melee", "missile", "attack"].includes(data.roll.type)
        ? OseDice.sendAttackRoll(rollData)
        : OseDice.sendRoll(rollData);
    }

    let roll;

    const buttons = [
      {
        action: "ok",
        label: game.i18n.localize("VF.Roll"),
        icon: "fas fa-dice-d20",
        callback: (_event, button) => {
          rolled = true;
          rollData.form = button.form;
          roll = ["melee", "missile", "attack"].includes(data.roll.type)
            ? OseDice.sendAttackRoll(rollData)
            : OseDice.sendRoll(rollData);
        },
        default: true,
      },
      {
        action: "cancel",
        icon: "fas fa-times",
        label: game.i18n.localize("VF.Cancel"),
        callback: () => {},
      },
    ];

    const html = await foundry.applications.handlebars.renderTemplate(template, dialogData);

    // Create Dialog window
    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: title || "" },
        content: html,
        buttons,
        submit: () => {
          resolve(rolled ? roll : false);
        },
      }).render(true);
    });
  },
};

export default OseDice;
