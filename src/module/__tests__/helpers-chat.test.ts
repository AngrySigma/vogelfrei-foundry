/**
 * @file Contains tests for chat helpers
 */
// eslint-disable-next-line prettier/prettier, import/no-cycle
import type { QuenchMethods } from "../../e2e";

export const key = "vf.helpers.chat";
export const options = {
  displayName: "VF: Helpers: Chat",
};

export default ({ describe }: QuenchMethods) => {
  // @todo: How do we test these properly?
  describe("applyChatCardDamage(roll, multiplier)", () => {});
  describe("addChatMessageContextOptions(_, options)", () => {});
  describe("addChatMessageButtons(msg. html)", () => {});
};
